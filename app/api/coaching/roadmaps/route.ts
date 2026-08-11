import {
  createRoadmapTemplate,
  listRoadmapTemplates,
  type RoadmapTemplateContent,
} from "@/lib/rich-coaching";
import { assertExactObjectKeys, RequestError } from "@/lib/http";
import {
  coachRequest,
  enumValue,
  exactJson,
  json,
  objectBody,
  optionalText,
  positiveInteger,
  requiredText,
  routeError,
  stringArray,
} from "../_shared";

export async function GET(request: Request) {
  const context = await coachRequest(request);
  if (context instanceof Response) return context;
  try {
    const url = new URL(request.url);
    const limitText = url.searchParams.get("limit");
    const templates = await listRoadmapTemplates({
      accountId: context.accountId,
      includeArchived: url.searchParams.get("includeArchived") === "true",
      favouriteOnly: url.searchParams.get("favouriteOnly") === "true",
      search: url.searchParams.get("search"),
      limit: limitText ? positiveInteger(Number(limitText), "limit") : undefined,
    });
    return json({ templates }, context.requestId);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export async function POST(request: Request) {
  const context = await coachRequest(request, true);
  if (context instanceof Response) return context;
  try {
    const body = await exactJson(request, ["title", "description", "content", "origin"]);
    const template = await createRoadmapTemplate({
      accountId: context.accountId,
      title: requiredText(body.title, "title", 160),
      description: requiredText(body.description, "description", 1_500),
      content: roadmapContent(body.content),
      origin: body.origin === undefined
        ? "coach"
        : enumValue(body.origin, "origin", ["coach", "editable_example"] as const),
      requestId: context.requestId,
    });
    return json({ template }, context.requestId, 201);
  } catch (error) {
    return routeError(error, context.requestId);
  }
}

export function roadmapContent(value: unknown): RoadmapTemplateContent {
  const content = objectBody(value, "content");
  assertExactObjectKeys(content, ["goalPrompt", "assessmentPrompt", "priorityPrompt", "phases"]);
  if (!Array.isArray(content.phases) || content.phases.length < 1 || content.phases.length > 12) {
    throw new RequestError(400, "invalid_field", "content.phases must contain 1 to 12 phases.");
  }
  return {
    goalPrompt: optionalText(content.goalPrompt, "content.goalPrompt", 1_000),
    assessmentPrompt: optionalText(content.assessmentPrompt, "content.assessmentPrompt", 1_000),
    priorityPrompt: optionalText(content.priorityPrompt, "content.priorityPrompt", 1_000),
    phases: content.phases.map((value, index) => {
      const phase = objectBody(value, `content.phases[${index}]`);
      assertExactObjectKeys(phase, ["title", "purpose", "rationale", "progressSignals"]);
      return {
        title: requiredText(phase.title, `content.phases[${index}].title`, 160),
        purpose: requiredText(phase.purpose, `content.phases[${index}].purpose`, 2_000),
        rationale: optionalText(phase.rationale, `content.phases[${index}].rationale`, 2_000),
        progressSignals: stringArray(phase.progressSignals, `content.phases[${index}].progressSignals`, 12),
      };
    }),
  };
}
