import type { Metadata } from "next";
import { OrgExplorer } from "@/components/org/explorer";
import { ProjectPage } from "@/components/project-page";
import { getProject } from "@/content/projects";

export const metadata: Metadata = {
  title: "Org Health Explorer",
  description: getProject("org-health").tagline,
};

export default function Page() {
  return (
    <ProjectPage slug="org-health">
      <OrgExplorer />
    </ProjectPage>
  );
}
