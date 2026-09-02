import { DegradedBanner } from "@/components/DegradedBanner";
import { CommandPalette } from "@/components/CommandPalette";

export default async function ProductionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  return (
    <>
      <DegradedBanner pid={pid} />
      <CommandPalette pid={pid} />
      {children}
    </>
  );
}
