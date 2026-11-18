import type { Metadata } from "next";
import { OrgExplorer } from "@/components/org/explorer";
import { ProjectPage } from "@/components/project-page";
import { getProject } from "@/content/projects";

export const metadata: Metadata = {
  title: "Kestrel Org Explorer",
  description: getProject("org-explorer").tagline,
};

export default function Page() {
  return (
    <ProjectPage slug="org-explorer">
      <OrgExplorer />
    </ProjectPage>
  );
}
