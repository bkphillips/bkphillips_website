import type { Metadata } from "next";
import { ProjectPage } from "@/components/project-page";
import { TasteExplorer } from "@/components/tastemap/explorer";
import { getProject } from "@/content/projects";

export const metadata: Metadata = {
  title: "Taste Map",
  description: getProject("taste-map").tagline,
};

export default function Page() {
  return (
    <ProjectPage slug="taste-map">
      <TasteExplorer />
    </ProjectPage>
  );
}
