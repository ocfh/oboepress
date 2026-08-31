import { createYoga } from "graphql-yoga";
import { schema, buildContext } from "@/lib/graphql/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const { handle } = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  // Accept both cookie (browser) and Bearer (API client) auth.
  context: ({ request }) => buildContext(request),
  graphiql: process.env.NODE_ENV !== "production",
  fetchAPI: { Response },
});

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function OPTIONS(request: Request) {
  return handle(request);
}
