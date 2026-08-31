import ContentEditor from "@/components/ContentEditor";

export const dynamic = "force-dynamic";

export default function NewPage() {
  return <ContentEditor kind="page" categories={[]} tags={[]} />;
}
