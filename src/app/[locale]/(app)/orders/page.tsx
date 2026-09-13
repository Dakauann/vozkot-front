import { setRequestLocale } from "next-intl/server";

import { OrderList } from "@/components/orders/order-list";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <OrderList />;
}
