"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ArrowClockwise, ArrowCounterClockwise, Check, CircleNotch, Plus, Trash, Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createLayout,
  createVenue,
  fetchLayout,
  generateLayout,
  listLayouts,
  listVenues,
  previewLayout,
  publishLayout,
  type Compliance,
  type Layout,
  type LayoutSeat,
  type LayoutSection,
  type SeatKind,
  type SectionSpec,
  type Venue,
} from "@/lib/seating/api";
import {
  CompliancePanel,
  PIECES,
  PieceDiagram,
  PieceInspector,
  blocksFrom,
  collisionsIn,
  defaultSize,
  describe,
  freshKey,
  isMarker,
  newDraft,
  toSpec,
  type Draft,
  type Piece,
  type Placement,
  type Rect,
} from "@/components/seating/builder-model";
import {
  AreaNode,
  BlockNode,
  BuilderViewProvider,
  MarkerNode,
  PAD,
  PAD_TOP,
  nodeTypeFor,
  type BuilderNode,
  type BuilderView,
} from "@/components/seating/builder-nodes";

/**
 * The room builder.
 *
 * It replaced a form. That is the whole change, and it was not a matter of
 * taste: a form can only describe a room it has a field for, and the rooms
 * organisers actually have are arrangements — a singer at one end, a column of
 * chairs down the middle, VIP boxes along both sides, a rodeo arena with a show
 * stage beside it. No set of number fields expresses that, and the previous
 * version proved it: every block generated at the same origin, so a room with
 * six sectors was one pile of dots, and a stage could not be moved because a
 * stage was not a thing you could hold — it was a word on the layout.
 *
 * So: a palette of things, a canvas you drop them on, and a panel for whatever
 * is selected. Three decisions hold it together.
 *
 *  - THE CANVAS OWNS PLACEMENT. A node's position and size are the only answer
 *    to where something is. Nothing else stores it, so nothing else can
 *    disagree with the thing being dragged.
 *
 *  - THE SERVER OWNS GEOMETRY. Seats come from the same generator the save
 *    calls, debounced. Laying out rows, aisles, odd/even numbering and arc
 *    bearings a second time in TypeScript would be two answers to "what does
 *    this room look like", and the canvas would be the one that lies.
 *
 *  - THE ROOM REMEMBERS ITS FORM. Each block is saved with the description that
 *    generated it, which is what makes a stored room reopenable rather than
 *    only viewable.
 */

/**
 * Long enough that typing "12" is one request, short enough that dropping a
 * piece feels like the piece landing rather than a wait.
 *
 * It was 260ms, which is fine for a form and wrong for a canvas: a dropped block
 * sat as an outline for a quarter of a second before it had any seats in it, and
 * that reads as a broken drop.
 */
const PREVIEW_DEBOUNCE_MS = 120;

/** How far apart two clicks on the same palette item drop their pieces. */
const CASCADE = 36;

/** What is on screen, built by the server from the current canvas. */
type Preview = {
  /**
   * The node ids that produced it, in order.
   *
   * The response has no idea what a node is; it comes back as a list in the
   * order the specs went out. Recording the order the request was BUILT from is
   * what keeps a late response from painting one block's seats inside another
   * block's box after something was added or removed.
   */
  keys: string[];
  sections: LayoutSection[];
  seats: LayoutSeat[];
  spec: string;
  compliance: Compliance | null;
  suggested: Record<string, SeatKind>;
};

const NOTHING: Preview = {
  keys: [],
  sections: [],
  seats: [],
  spec: "",
  compliance: null,
  suggested: {},
};

export function LayoutBuilder() {
  return (
    <ReactFlowProvider>
      <Builder />
    </ReactFlowProvider>
  );
}

function Builder() {
  const t = useTranslations("layoutStudio");
  const { screenToFlowPosition, getViewport, fitView } = useReactFlow();

  const [venues, setVenues] = React.useState<Venue[] | null>(null);
  const [venueId, setVenueId] = React.useState("");
  const [layouts, setLayouts] = React.useState<Layout[]>([]);
  const [layoutId, setLayoutId] = React.useState("");

  const [nodes, setNodes] = React.useState<BuilderNode[]>([]);
  const [past, setPast] = React.useState<BuilderNode[][]>([]);
  const [future, setFuture] = React.useState<BuilderNode[][]>([]);

  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [generation, setGeneration] = React.useState(0);
  const [loaded, setLoaded] = React.useState<{ id: string; layout: Layout | null } | null>(null);
  const [preview, setPreview] = React.useState<Preview>(NOTHING);
  // Whether the server could draw the room at all. Swallowing this left the
  // previous room on screen with nothing to distinguish "your change is
  // invalid" from "the canvas is broken", and an organiser correctly concluded
  // the second.
  const [refused, setRefused] = React.useState(false);

  // What a click on a chair does. Two tools rather than a modifier key, because
  // a surface that behaves two ways has to say which one it is in.
  const [marking, setMarking] = React.useState(false);
  const [markKind, setMarkKind] = React.useState<SeatKind>("wheelchair");

  const nodeTypes = React.useMemo<NodeTypes>(
    () => ({ block: BlockNode, area: AreaNode, marker: MarkerNode }),
    [],
  );

  // --- what the room is, as the server will build it -------------------------

  const nameOf = React.useCallback(
    (draft: Draft) => draft.name.trim() || t(`defaultName.${draft.piece}`),
    [t],
  );

  const { specs, specKey, keyList } = React.useMemo(() => {
    const ordered = nodes.map((node, index) => {
      const draft = node.data.draft;
      const size = defaultSize(draft.piece);
      const placement: Placement =
        node.type === "block"
          ? {
              // A block's node box is drawn around its seats, so the seats
              // themselves start one padding in. Getting this wrong shifts the
              // room by a border every time it is saved and reopened.
              offsetX: node.position.x + PAD,
              offsetY: node.position.y + PAD_TOP,
              width: 0,
              height: 0,
            }
          : {
              offsetX: node.position.x,
              offsetY: node.position.y,
              width: node.width ?? size?.width ?? 0,
              height: node.height ?? size?.height ?? 0,
            };
      return toSpec({ ...draft, name: nameOf(draft), displayOrder: index + 1 }, placement);
    });
    return {
      specs: ordered,
      // A STRING, and the effect below depends on this rather than on the array.
      // Every re-render builds a new array with identical contents, and an
      // effect watching the array cleared its own pending request on each of
      // them — which is why editing a number changed nothing on screen.
      specKey: JSON.stringify(ordered),
      keyList: nodes.map((node) => node.id).join("\u0000"),
    };
  }, [nodes, nameOf]);

  // --- loading ---------------------------------------------------------------

  React.useEffect(() => {
    let live = true;
    listVenues().then((result) => {
      if (!live) return;
      const found = result.data?.data ?? [];
      setVenues(found);
      if (found.length > 0) setVenueId((current) => current || found[0].id);
    });
    return () => {
      live = false;
    };
  }, []);

  React.useEffect(() => {
    if (!venueId) return;
    let live = true;
    listLayouts(venueId).then((result) => {
      if (!live) return;
      const found = result.data?.data ?? [];
      setLayouts(found);
      setLayoutId(found[0]?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [venueId]);

  React.useEffect(() => {
    if (!layoutId) return;
    let live = true;
    fetchLayout(layoutId).then((detail) => {
      if (!live) return;
      setLoaded({ id: layoutId, layout: detail?.layout ?? null });
      // The saved room, rebuilt into objects from the form each block was
      // generated from. A section without one predates the builder; it is
      // skipped rather than guessed at, because inventing a form that happens
      // to produce the same dots would quietly change the room on the next
      // save.
      setNodes(nodesFromSections(detail?.sections ?? []));
      setPast([]);
      setFuture([]);
      setDirty(false);
      setPreview(NOTHING);
      setRefused(false);
    });
    return () => {
      live = false;
    };
  }, [layoutId, generation]);

  // The live room, from the SAME generator the save calls. Debounced.
  React.useEffect(() => {
    if (!layoutId || specKey === "[]") return;
    let live = true;
    const timer = window.setTimeout(() => {
      // The serialised room is the request body, so nothing has to be carried
      // past the debounce and there is no second copy to fall out of step.
      const body = JSON.parse(specKey) as SectionSpec[];
      previewLayout(layoutId, body).then((result) => {
        if (!live) return;
        if (result.error || !result.data) {
          // The organiser gets a sentence in their own language; the server's
          // own words go to the console, where somebody debugging wants them.
          // "seating: 300 rows exceeds the 24 available letters" is a log line,
          // not an error message for a person building a room.
          if (result.error) console.warn("preview refused:", result.error.message);
          setRefused(true);
          return;
        }
        setRefused(false);
        setPreview({
          // Stamped with the specs it was built from, so a response arriving
          // after the canvas moved on is visibly stale instead of quietly wrong.
          keys: keyList.split("\u0000"),
          sections: result.data.sections ?? [],
          seats: result.data.seats ?? [],
          spec: specKey,
          // Measured against THIS room. Fetching it for the stored layout is
          // what produced "against 0 places, the quotas are met" beside a
          // 192-seat sector.
          compliance: result.data.compliance ?? null,
          suggested: result.data.suggestedKinds ?? {},
        });
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // `generation` is in here on purpose. Loading a layout clears the preview,
    // and a publish reloads the very same sections — same ids, same specs — so
    // without this the effect had no changed dependency to re-run on, the
    // geometry stayed cleared, and every block sat on its placeholder until the
    // page was refreshed.
  }, [layoutId, specKey, keyList, generation]);

  // Stale exactly when the drawing does not correspond to the canvas.
  const stale = preview.spec !== "" && preview.spec !== specKey;
  const current = loaded?.id === layoutId ? loaded : null;
  const layout = current?.layout ?? null;
  const frozen = layout?.frozen ?? false;
  const selected = nodes.find((node) => node.selected) ?? null;

  // --- what the nodes draw ---------------------------------------------------

  const blocks = React.useMemo(() => blocksFrom(preview), [preview]);

  // A stable door back into the current render, so the context handed to every
  // node does not change identity on each mouse move of a drag.
  const markRef = React.useRef<(nodeId: string, key: string) => void>(() => {});
  const onMarkSeat = React.useCallback(
    (nodeId: string, key: string) => markRef.current(nodeId, key),
    [],
  );

  // Which block a suggestion would land on: the first one with chairs in it.
  const suggestFor = React.useMemo(
    () => nodes.find((node) => node.type === "block")?.id ?? null,
    [nodes],
  );

  /**
   * What each piece occupies, and which pieces are on top of something.
   *
   * A seated block's footprint is the extent of its CHAIRS plus the padding its
   * frame draws, which is what is visibly on the floor. Anything else is its own
   * declared size. Computed from the same numbers the server will use, so the
   * canvas and the save agree about what a collision is.
   */
  const collisions = React.useMemo(() => {
    const boxes: Record<string, Rect> = {};
    for (const node of nodes) {
      const geometry = blocks[node.id];
      if (node.type === "block") {
        if (!geometry) continue;
        boxes[node.id] = {
          x: node.position.x,
          y: node.position.y,
          width: geometry.width + PAD * 2,
          height: geometry.height + PAD + PAD_TOP,
        };
        continue;
      }
      const size = defaultSize(node.data.draft.piece);
      boxes[node.id] = {
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? size?.width ?? 0,
        height: node.height ?? size?.height ?? 0,
      };
    }
    return collisionsIn(boxes);
  }, [nodes, blocks]);

  const view = React.useMemo<BuilderView>(
    () => ({ blocks, suggested: preview.suggested, suggestFor, marking, onMarkSeat, collisions }),
    [blocks, preview.suggested, suggestFor, marking, onMarkSeat, collisions],
  );

  /**
   * Frame the room once it has something in it.
   *
   * `fitView` as a prop only applies to the nodes the canvas mounted with, and a
   * saved room arrives after that — a layout opened from the list would
   * otherwise sit somewhere off screen with an empty canvas in front of it. It
   * fires when geometry first appears for a layout and not on every drag, so it
   * never yanks the view out from under a hand.
   */
  const framed = Object.keys(blocks).length > 0;
  React.useEffect(() => {
    if (!framed) return;
    // One frame of slack: the nodes have to be measured before they can be fit.
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.25, maxZoom: 1, duration: 200 });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [layoutId, framed, fitView]);

  // --- editing ---------------------------------------------------------------

  /**
   * Remember the canvas as it is now, so the next change can be taken back.
   *
   * Thirty steps. A mis-drag on a seven-hundred-seat arena is otherwise
   * unrecoverable, and keeping every step of a long session costs memory for
   * something nobody reaches back that far for.
   */
  const remember = React.useCallback((from: BuilderNode[]) => {
    setPast((stack) => [...stack.slice(-29), from]);
    setFuture([]);
  }, []);

  /**
   * Change the canvas, recording what it was.
   *
   * The snapshot is taken from THIS render rather than from inside the state
   * updater. An updater may run more than once for a single change, and a
   * history that grew a duplicate entry per render would make one undo look
   * like it did nothing.
   */
  const commit = React.useCallback(
    (next: BuilderNode[] | ((current: BuilderNode[]) => BuilderNode[])) => {
      remember(nodes);
      setNodes(typeof next === "function" ? next(nodes) : next);
      setDirty(true);
    },
    [nodes, remember],
  );

  const undo = () => {
    if (past.length === 0) return;
    setFuture((stack) => [nodes, ...stack.slice(0, 29)]);
    setNodes(past[past.length - 1]);
    setPast((stack) => stack.slice(0, -1));
    setDirty(true);
  };

  const redo = () => {
    if (future.length === 0) return;
    setPast((stack) => [...stack.slice(-29), nodes]);
    setNodes(future[0]);
    setFuture((stack) => stack.slice(1));
    setDirty(true);
  };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      // Not while a name is being typed: the field has its own undo, and
      // stealing it would be worse than not having one.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [past, future, nodes]);

  // Whether a resize is in progress, so its first frame is the one that gets
  // remembered. A resize arrives as a stream of dimension changes; snapshotting
  // each of them would fill the history with a hundred intermediate sizes.
  const resizing = React.useRef(false);

  const onNodesChange = (changes: NodeChange<BuilderNode>[]) => {
    // A deletion, a finished drag or a finished resize changes the ROOM; a
    // selection does not. Marking everything dirty would offer a Save for
    // having clicked on something.
    const removing = changes.some((change) => change.type === "remove");
    const sized = changes.some(
      (change) => change.type === "dimensions" && Boolean(change.setAttributes),
    );
    const dropped = changes.some(
      (change) => change.type === "position" && change.dragging === false,
    );

    if (removing) remember(nodes);
    if (sized && !resizing.current) {
      resizing.current = true;
      remember(nodes);
    }
    if (changes.some((change) => change.type === "dimensions" && !change.resizing)) {
      resizing.current = false;
    }

    setNodes((current) => applyNodeChanges(changes, current));
    if (removing || sized || dropped) setDirty(true);
  };

  /** Put a piece on the canvas at a point in the room's own coordinates. */
  const place = React.useCallback(
    (piece: Piece, at: { x: number; y: number }) => {
      const draft = newDraft(piece);
      // Named on arrival, and numbered when it is not the first of its kind.
      // Two sections called "Camarote" are indistinguishable in the pricing list
      // an event binds with, and naming every piece by hand before anything
      // renders is a step nobody should owe us.
      const same = nodes.filter((node) => node.data.draft.piece === piece).length;
      const base = t(`defaultName.${piece}`);
      draft.name = same === 0 ? base : `${base} ${same + 1}`;
      const size = defaultSize(piece);
      const type = nodeTypeFor(piece);
      const node = {
        id: draft.key,
        type,
        position: { x: Math.round(at.x), y: Math.round(at.y) },
        // Only a sized thing carries dimensions. A block of seats is as big as
        // its seats, and a number beside it would be a second answer.
        ...(size ? { width: size.width, height: size.height } : {}),
        data: { draft },
        selected: true,
      } as BuilderNode;
      commit((current) => [
        ...current.map((existing) => ({ ...existing, selected: false })),
        node,
      ]);
    },
    [commit, nodes, t],
  );

  /** A click on a palette item, for anybody not dragging with a mouse. */
  const addFromPalette = React.useCallback(
    (piece: Piece) => {
      const viewport = getViewport();
      const box =
        typeof window === "undefined"
          ? { width: 900, height: 600 }
          : { width: window.innerWidth, height: window.innerHeight };
      // The middle of what is on screen, nudged along so a second click does
      // not hide its piece exactly under the first.
      const cascade = nodes.length * CASCADE;
      place(piece, {
        x: (box.width / 2 - viewport.x) / viewport.zoom - 140 + cascade,
        y: (box.height / 2 - viewport.y) / viewport.zoom - 80 + cascade,
      });
    },
    [getViewport, nodes.length, place],
  );

  /**
   * Change one piece.
   *
   * Typing a name is not a step worth undoing: the field has its own undo, and
   * a history entry per keystroke would push the drag that actually mattered
   * off the end of the stack.
   */
  const edit = (next: Draft) => {
    const before = nodes.find((node) => node.id === next.key)?.data.draft;
    const renaming =
      before !== undefined && JSON.stringify({ ...before, name: "" }) === JSON.stringify({ ...next, name: "" });
    const applied = nodes.map((node) =>
      node.id === next.key ? ({ ...node, data: { draft: next } } as BuilderNode) : node,
    );
    if (!renaming) remember(nodes);
    setNodes(applied);
    setDirty(true);
  };

  const resizeSelected = (size: { width: number; height: number }) => {
    if (!selected) return;
    commit((current) =>
      current.map((node) =>
        node.id === selected.id ? { ...node, width: size.width, height: size.height } : node,
      ),
    );
  };

  const removeSelected = () => {
    if (!selected) return;
    commit((current) => current.filter((node) => node.id !== selected.id));
  };

  /**
   * Copy, paste and duplicate.
   *
   * Eight camarotes around a room is eight identical pieces, and a builder
   * without a clipboard makes that eight trips through a palette and four
   * fields. The copy is a DRAFT plus a size — not a node — so pasting cannot
   * resurrect an id that already exists on the canvas.
   */
  const [clipboard, setClipboard] = React.useState<{
    draft: Draft;
    width?: number;
    height?: number;
  } | null>(null);

  const copySelected = () => {
    if (!selected) return;
    setClipboard({
      draft: selected.data.draft,
      width: selected.width,
      height: selected.height,
    });
  };

  /**
   * Put a copy down, offset from what it came from.
   *
   * Offset rather than on top: a paste that landed exactly under the original
   * looks like nothing happened, and the only way to find out otherwise is to
   * drag the room apart.
   */
  const paste = (source: { draft: Draft; width?: number; height?: number } | null, times = 1) => {
    if (!source) return;
    const draft = { ...source.draft, key: freshKey(), seatKinds: { ...(source.draft.seatKinds ?? {}) } };
    // Numbered on, so two copies are never the same name in the pricing list.
    const base = source.draft.name.trim() || t(`defaultName.${source.draft.piece}`);
    const same = nodes.filter((node) => node.data.draft.piece === source.draft.piece).length;
    draft.name = `${base.replace(/\s\d+$/, "")} ${same + 1}`;

    const anchor = nodes.find((node) => node.id === selected?.id) ?? nodes[nodes.length - 1];
    const node = {
      id: draft.key,
      type: nodeTypeFor(draft.piece),
      position: {
        x: (anchor?.position.x ?? 0) + CASCADE * times,
        y: (anchor?.position.y ?? 0) + CASCADE * times,
      },
      ...(source.width && source.height
        ? { width: source.width, height: source.height }
        : {}),
      data: { draft },
      selected: true,
    } as BuilderNode;
    commit((current) => [...current.map((one) => ({ ...one, selected: false })), node]);
  };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      // Never while a field has the caret: the browser's own copy and paste are
      // what somebody editing a name is reaching for.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "c" && selected) {
        event.preventDefault();
        copySelected();
      } else if (key === "v" && clipboard) {
        event.preventDefault();
        paste(clipboard);
      } else if (key === "d" && selected) {
        // Duplicate: copy and paste in one stroke, which is the gesture people
        // actually use when laying out eight of something.
        event.preventDefault();
        paste({ draft: selected.data.draft, width: selected.width, height: selected.height });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, clipboard, nodes]);

  /**
   * A click on a chair sets its kind, on the block that owns it.
   *
   * On THAT block and not on a merged set for the whole room: "K/12" is a row
   * and a seat label, and two blocks both having one is ordinary, so a shared
   * table would mark a chair in a sector nobody clicked.
   */
  const markSeat = (nodeId: string, key: string) => {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target) return;
    const kinds = { ...(target.data.draft.seatKinds ?? {}) };
    if (markKind === "standard") delete kinds[key];
    else kinds[key] = markKind;
    edit({ ...target.data.draft, seatKinds: kinds });
  };

  // Kept current from an effect rather than assigned while rendering, so the
  // stable callback the nodes hold always reaches this render's version.
  React.useEffect(() => {
    markRef.current = markSeat;
  });

  /**
   * Apply the server's choice of accessible seats.
   *
   * This is the answer to a warning that used to be unanswerable: it ended with
   * "mark the seats in the section form" while nothing in the interface could
   * mark a seat. The server picks them — back row, outward from the middle, a
   * companion beside every wheelchair space — and any of them can be moved
   * afterwards by switching to the marking tool and clicking.
   */
  const applySuggestion = () => {
    if (Object.keys(preview.suggested).length === 0) return;
    const target = nodes.find((node) => node.type === "block");
    if (!target) return;
    edit({
      ...target.data.draft,
      seatKinds: { ...(target.data.draft.seatKinds ?? {}), ...preview.suggested },
    });
  };

  // --- saving ----------------------------------------------------------------

  const addVenue = async () => {
    const name = window.prompt(t("venue.prompt"))?.trim();
    if (!name) return;
    setBusy(true);
    const result = await createVenue(name);
    setBusy(false);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? t("failed"));
      return;
    }
    const venue = result.data.data;
    setVenues((list) => [...(list ?? []), venue]);
    setVenueId(venue.id);
  };

  const addLayout = async () => {
    if (!venueId) return;
    const name = window.prompt(t("layout.prompt"))?.trim();
    if (!name) return;
    setBusy(true);
    const result = await createLayout(venueId, { name });
    setBusy(false);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? t("failed"));
      return;
    }
    const created = result.data.data;
    setLayouts((list) => [...list, created]);
    setLayoutId(created.id);
  };

  const save = async () => {
    if (!layoutId || specs.length === 0) return;
    setBusy(true);
    const result = await generateLayout(layoutId, specs);
    setBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setDirty(false);
    toast.success(t("saved"));
    setGeneration((value) => value + 1);
  };

  const publish = async () => {
    if (!layoutId) return;
    setBusy(true);
    const result = await publishLayout(layoutId);
    setBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t("published"));
    setGeneration((value) => value + 1);
  };

  if (venues === null) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  }

  // Counted from the blocks that are still ON the canvas. Taking it from the
  // preview would keep reporting the seats of a sector somebody just deleted,
  // and the number beside Publish has to mean what it says.
  const seatTotal = nodes.reduce(
    (total, node) => total + (blocks[node.id]?.seats.length ?? 0),
    0,
  );

  return (
    // Full-bleed. The shell pads its children; a builder escapes it, because
    // the room wants the width and the height of the screen.
    <div className="-m-3 flex min-h-[calc(100vh-3rem)] flex-col sm:-m-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <label htmlFor="builder-venue" className="sr-only">
            {t("venue.label")}
          </label>
          <BarSelect
            id="builder-venue"
            value={venueId}
            onChange={setVenueId}
            disabled={busy}
            placeholder={t("venue.none")}
            options={venues.map((venue) => ({ value: venue.id, label: venue.name }))}
          />
          <IconButton label={t("venue.add")} onClick={() => void addVenue()} disabled={busy}>
            <Plus className="size-3.5" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <label htmlFor="builder-layout" className="sr-only">
            {t("layout.label")}
          </label>
          <BarSelect
            id="builder-layout"
            value={layoutId}
            onChange={(id) => {
              setLayoutId(id);
              setDirty(false);
            }}
            disabled={busy || !venueId}
            placeholder={t("layout.none")}
            options={layouts.map((item) => ({
              value: item.id,
              label: `${item.name} · v${item.version}`,
            }))}
          />
          <IconButton
            label={t("layout.add")}
            onClick={() => void addLayout()}
            disabled={busy || !venueId}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </IconButton>
        </div>

        {/* State, said once and plainly. */}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
            dirty
              ? "bg-warning-subtle text-warning-ink"
              : "bg-muted text-muted-foreground",
          )}
        >
          {dirty ? t("state.unsaved") : layout ? t(`state.${layout.status}`) : t("state.draft")}
        </span>

        {seatTotal > 0 ? (
          <span className="text-[0.6875rem] text-muted-foreground">
            {t("canvas.count", { seats: seatTotal })}
          </span>
        ) : null}

        {preview.compliance ? (
          <span
            className={cn(
              "flex items-center gap-1 text-[0.6875rem]",
              preview.compliance.compliant ? "text-muted-foreground" : "text-warning-ink",
            )}
          >
            {preview.compliance.compliant ? (
              <Check className="size-3" aria-hidden="true" />
            ) : (
              <Warning className="size-3" aria-hidden="true" />
            )}
            {preview.compliance.compliant ? t("compliance.ok") : t("compliance.short")}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <IconButton label={t("undo")} onClick={undo} disabled={past.length === 0 || busy}>
            <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton label={t("redo")} onClick={redo} disabled={future.length === 0 || busy}>
            <ArrowClockwise className="size-3.5" aria-hidden="true" />
          </IconButton>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void save()}
            disabled={busy || frozen || specs.length === 0 || collisions.size > 0}
          >
            {busy ? t("saving") : t("save")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void publish()}
            disabled={
              busy || dirty || seatTotal === 0 || layout?.status === "published" ||
              collisions.size > 0
            }
          >
            {t("publish")}
          </Button>
        </div>
      </header>

      {frozen ? (
        <p className="flex items-start gap-1.5 border-b border-border bg-warning-subtle px-4 py-2 text-xs leading-5 text-warning-ink">
          <Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("layout.frozenExplained")}
        </p>
      ) : null}

      {layoutId === "" ? (
        <div className="grid flex-1 place-items-center p-6">
          <p className="max-w-[46ch] text-center text-sm leading-6 text-muted-foreground">
            {t("layout.choose")}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <Palette onAdd={addFromPalette} disabled={frozen} />

          <div className="relative min-h-[420px] flex-1">
            <BuilderViewProvider value={view}>
              <ReactFlow<BuilderNode>
                nodes={nodes}
                onNodesChange={onNodesChange}
                nodeTypes={nodeTypes}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const piece = event.dataTransfer.getData("application/vozkot-piece");
                  if (!PIECES.includes(piece as Piece)) return;
                  // Where the cursor let go, in the ROOM's coordinates rather
                  // than the screen's, so a drop lands under the pointer at any
                  // zoom or pan.
                  const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
                  place(piece as Piece, at);
                }}
                // Dragging is off while marking: a click meant for a chair must
                // not move the room it is in.
                nodesDraggable={!marking && !frozen}
                nodesConnectable={false}
                elementsSelectable={!frozen}
                deleteKeyCode={frozen ? null : ["Backspace", "Delete"]}
                fitView
                fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
                minZoom={0.1}
                maxZoom={2.5}
                className="bg-background"
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={24}
                  size={1}
                  color="hsl(var(--border-strong))"
                />
                <Controls
                  className="!border-border !bg-card !shadow-sm [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-foreground"
                  showInteractive={false}
                />
                <MiniMap
                  className="!rounded-[--radius] !border !border-border !bg-card"
                  // Scenery reads as scenery here too. One colour for everything
                  // turned the map into three anonymous green bars, which is no
                  // more use than no map.
                  nodeColor={(node) =>
                    node.type === "marker"
                      ? "hsl(var(--muted-foreground) / 0.55)"
                      : node.type === "area"
                        ? "hsl(var(--primary) / 0.35)"
                        : "hsl(var(--primary) / 0.8)"
                  }
                  nodeStrokeWidth={0}
                  nodeBorderRadius={3}
                  maskColor="hsl(var(--muted) / 0.55)"
                  style={{ width: 168, height: 112 }}
                  pannable
                  zoomable
                />

                <Panel position="top-left" className="!m-2">
                  <Tools
                    marking={marking}
                    onMarking={setMarking}
                    markKind={markKind}
                    onMarkKind={setMarkKind}
                    disabled={frozen}
                  />
                </Panel>

                {collisions.size > 0 ? (
                  <Panel position="top-right" className="!m-2">
                    <span
                      role="status"
                      className="flex max-w-[36ch] items-start gap-1.5 rounded-[--radius] border border-warning-ink/40 bg-warning-subtle px-2 py-1 text-[0.6875rem] leading-4 text-warning-ink shadow-sm"
                    >
                      <Warning className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      {t("canvas.collision", { count: collisions.size })}
                    </span>
                  </Panel>
                ) : refused ? (
                  <Panel position="top-right" className="!m-2">
                    <span
                      role="status"
                      className="flex max-w-[34ch] items-start gap-1.5 rounded-[--radius] border border-warning-ink/40 bg-warning-subtle px-2 py-1 text-[0.6875rem] leading-4 text-warning-ink shadow-sm"
                    >
                      <Warning className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      {t("canvas.failed")}
                    </span>
                  </Panel>
                ) : stale ? (
                  <Panel position="top-right" className="!m-2">
                    <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-[0.6875rem] text-muted-foreground shadow-sm">
                      <CircleNotch className="size-3 animate-spin" aria-hidden="true" />
                      {t("canvas.updating")}
                    </span>
                  </Panel>
                ) : null}
              </ReactFlow>
            </BuilderViewProvider>

            {/* The empty room. Not a message in a box: it names the first
                action and points at the thing that performs it. */}
            {nodes.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
                <div className="max-w-[40ch] text-center">
                  <p className="font-display text-base font-semibold text-foreground">
                    {t("empty.title")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t("empty.hint")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="shrink-0 overflow-y-auto border-t border-border bg-card p-4 lg:w-[320px] lg:border-l lg:border-t-0">
            {selected ? (
              <>
                <PieceInspector
                  draft={selected.data.draft}
                  size={{
                    width: selected.width ?? defaultSize(selected.data.draft.piece)?.width ?? 0,
                    height: selected.height ?? defaultSize(selected.data.draft.piece)?.height ?? 0,
                  }}
                  onChange={edit}
                  onResize={resizeSelected}
                  disabled={frozen}
                />
                <p className="mt-3 text-[0.6875rem] text-muted-foreground">
                  {/* The count from the drawn room, unless the server could
                      not draw it — in which case the last good number belongs
                      to a different room, and reporting it beside a refusal is
                      how "300 fileiras · 48 lugares" happened. */}
                  {describe(
                    selected.data.draft,
                    t,
                    refused ? undefined : blocks[selected.id]?.seats.length,
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={removeSelected}
                  disabled={frozen}
                  className="mt-2 text-warning-ink hover:text-warning-ink"
                >
                  <Trash className="size-3.5" aria-hidden="true" />
                  {t("remove")}
                </Button>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">{t("inspector.none")}</p>
            )}

            {preview.compliance ? (
              <CompliancePanel
                report={preview.compliance}
                fixable={Object.keys(preview.suggested).length > 0 && !frozen}
                onFix={applySuggestion}
              />
            ) : null}

            <Legend />
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Rebuild the canvas from a saved room.
 *
 * Only from each block's own stored form. A section without one was generated
 * before the builder existed; it is left out rather than reconstructed, because
 * a form invented to match a field of dots would produce a different room on
 * the next save and nobody would know which save changed it.
 */
function nodesFromSections(sections: LayoutSection[]): BuilderNode[] {
  const ordered = [...sections].sort((a, b) => a.displayOrder - b.displayOrder);
  const nodes: BuilderNode[] = [];
  for (const section of ordered) {
    const definition = section.definition;
    if (!definition) continue;
    const piece = pieceOf(definition, section);
    const draft: Draft = {
      ...stripPlacement(definition),
      key: section.id,
      piece,
      name: section.name,
    };
    const type = nodeTypeFor(piece);
    nodes.push({
      id: section.id,
      type,
      position:
        type === "block"
          ? { x: section.offsetX - PAD, y: section.offsetY - PAD_TOP }
          : { x: section.offsetX, y: section.offsetY },
      ...(type === "block"
        ? {}
        : {
            width: section.width || defaultSize(piece)?.width || 120,
            height: section.height || defaultSize(piece)?.height || 80,
          }),
      data: { draft },
    } as BuilderNode);
  }
  return nodes;
}

/** Which palette item a stored block came from, read off what it is. */
function pieceOf(spec: SectionSpec, section: LayoutSection): Piece {
  const kind = spec.kind ?? section.kind;
  if (kind === "stage" || kind === "arena") return kind;
  if (kind === "standing") return "standing";
  if (kind === "booth") return "booth";
  if ((spec.tables ?? 0) > 0) return "tables";
  return spec.rowShape === "arc" ? "arc" : "linear";
}

/** Placement lives on the canvas, so it is dropped on the way in. */
function stripPlacement(spec: SectionSpec): Omit<
  SectionSpec,
  "offsetX" | "offsetY" | "width" | "height"
> {
  const { offsetX, offsetY, width, height, ...rest } = spec;
  void offsetX;
  void offsetY;
  void width;
  void height;
  return rest;
}

/**
 * The things a room is made of.
 *
 * Draggable, and also clickable: drag-and-drop alone would put the whole
 * builder out of reach of a keyboard, and a click that drops the piece in the
 * middle of the view is the same action with one fewer requirement.
 */
function Palette({
  onAdd,
  disabled,
}: {
  onAdd: (piece: Piece) => void;
  disabled: boolean;
}) {
  const t = useTranslations("layoutStudio");
  return (
    <div className="shrink-0 border-b border-border bg-card p-2 lg:w-[184px] lg:border-b-0 lg:border-r">
      <h2 className="px-1 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("palette.title")}
      </h2>
      <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
        {PIECES.map((piece) => (
          <li key={piece} className="shrink-0 lg:shrink">
            <button
              type="button"
              draggable={!disabled}
              disabled={disabled}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/vozkot-piece", piece);
                event.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onAdd(piece)}
              title={t(`pieceHint.${piece}`)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[--radius] px-2 py-1.5 text-left",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50",
                !disabled && "cursor-grab active:cursor-grabbing",
              )}
            >
              <PieceDiagram
                piece={piece}
                className={cn("shrink-0", isMarker(piece) ? "text-primary" : "text-foreground")}
              />
              <span className="min-w-0 text-xs font-medium text-foreground">
                {t(`piece.${piece}`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 hidden space-y-1.5 px-1 lg:block">
        <p className="text-[0.6875rem] leading-4 text-muted-foreground">{t("palette.hint")}</p>
        {/* The shortcuts, written down. A clipboard nobody is told about is a
            clipboard nobody uses, and laying out eight camarotes by hand is the
            work it exists to remove. */}
        <p className="text-[0.625rem] leading-[1.4] text-muted-foreground/80">
          {t("palette.shortcuts")}
        </p>
      </div>
    </div>
  );
}

/** What a click on the canvas does. */
function Tools({
  marking,
  onMarking,
  markKind,
  onMarkKind,
  disabled,
}: {
  marking: boolean;
  onMarking: (value: boolean) => void;
  markKind: SeatKind;
  onMarkKind: (kind: SeatKind) => void;
  disabled: boolean;
}) {
  const t = useTranslations("layoutStudio");
  const kinds: SeatKind[] = [
    "wheelchair",
    "companion",
    "reduced_mobility",
    "obese",
    "restricted_view",
    "standard",
  ];
  return (
    <div className="flex items-center gap-1.5 rounded-[--radius] border border-border bg-card p-1 shadow-sm">
      <div role="group" aria-label={t("mode.label")} className="flex">
        {[false, true].map((value) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => onMarking(value)}
            disabled={disabled}
            aria-pressed={marking === value}
            className={cn(
              "rounded-[calc(var(--radius)-2px)] px-2 py-1 text-[0.6875rem] font-medium",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:opacity-50",
              marking === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value ? t("mode.mark") : t("mode.move")}
          </button>
        ))}
      </div>
      {marking ? (
        <>
          <label htmlFor="builder-kind" className="sr-only">
            {t("mode.kindLabel")}
          </label>
          <select
            id="builder-kind"
            value={markKind}
            onChange={(event) => onMarkKind(event.target.value as SeatKind)}
            disabled={disabled}
            className="h-6 rounded-[calc(var(--radius)-2px)] border border-border bg-card px-1 text-[0.6875rem] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kind.${kind}`)}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}

/**
 * What the shapes mean.
 *
 * The same legend a printed Brazilian seat map carries, for the same reason: a
 * square and a circle are only self-explanatory once somebody has said which is
 * which.
 */
function Legend() {
  const t = useTranslations("layoutStudio");
  return (
    <section aria-labelledby="legend-heading" className="mt-5 border-t border-border pt-4">
      <h2 id="legend-heading" className="legend">
        {t("legend.title")}
      </h2>
      <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
        {(
          [
            ["standard", "circle", "muted"],
            ["wheelchair", "square", "primary"],
            ["companion", "square", "subtle"],
            ["reduced_mobility", "ring", "primary"],
            ["obese", "wide", "primary"],
            ["restricted_view", "circle", "warning"],
          ] as const
        ).map(([kind, shape, tone]) => (
          <li key={kind} className="flex items-center gap-1.5 text-[0.6875rem] text-foreground">
            <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
              {shape === "square" ? (
                <rect
                  x={2}
                  y={2}
                  width={12}
                  height={12}
                  rx={2.5}
                  className={
                    tone === "subtle"
                      ? "fill-primary-subtle stroke-primary"
                      : "fill-primary stroke-primary"
                  }
                  strokeWidth={1.5}
                />
              ) : shape === "wide" ? (
                <rect
                  x={0}
                  y={4}
                  width={16}
                  height={8}
                  rx={4}
                  className="fill-primary stroke-primary"
                  strokeWidth={1.5}
                />
              ) : (
                <>
                  <circle
                    cx={8}
                    cy={8}
                    r={6}
                    className={
                      tone === "primary"
                        ? "fill-primary stroke-primary"
                        : tone === "warning"
                          ? "fill-muted stroke-warning-ink"
                          : "fill-muted stroke-border-strong"
                    }
                    strokeWidth={1.5}
                  />
                  {shape === "ring" ? <circle cx={8} cy={8} r={2} className="fill-card" /> : null}
                </>
              )}
            </svg>
            {t(`kind.${kind}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- the bar's own controls --------------------------------------------------

function BarSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-8 max-w-[180px] truncate rounded-[--radius] border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {options.length === 0 ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-[--radius] border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {children}
    </button>
  );
}
