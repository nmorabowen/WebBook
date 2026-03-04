import type { Metadata } from "next";
import { WorkspaceDebugRecorder } from "@/components/workspace-debug-recorder";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <WorkspaceDebugRecorder />
      {children}
    </>
  );
}
