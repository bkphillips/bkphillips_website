import type { Metadata } from "next";
import { NightlyExplorer } from "@/components/nightly/explorer";
import { ProjectPage } from "@/components/project-page";
import { getProject } from "@/content/projects";

export const metadata: Metadata = {
  title: "Nightly",
  description: getProject("nightly").tagline,
};

export default function Page() {
  return (
    <ProjectPage slug="nightly">
      <NightlyExplorer />
    </ProjectPage>
  );
}
