import { DegradedBanner } from "@/components/DegradedBanner";
import { CommandPalette } from "@/components/CommandPalette";
import { SideNav } from "@/components/SideNav";

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
      <div className="flex gap-5 items-start">
        <SideNav pid={pid} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </>
  );
}
