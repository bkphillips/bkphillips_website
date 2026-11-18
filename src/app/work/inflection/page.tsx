import type { Metadata } from "next";
import { InflectionTool } from "@/components/inflection/tool";
import { ProjectPage } from "@/components/project-page";
import { getProject } from "@/content/projects";

export const metadata: Metadata = {
  title: "Inflection",
  description: getProject("inflection").tagline,
};

export default function Page() {
  return (
    <ProjectPage slug="inflection" compact>
      <InflectionTool />
    </ProjectPage>
  );
}
