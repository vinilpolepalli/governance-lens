import { getConn } from "@/lib/db";
import { getCompany } from "@/lib/db/repo";
import { handle } from "@/lib/api";
import { ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = (_: Request, { params }: { params: { ticker: string } }) =>
  handle(async () => {
    const co = await getCompany(await getConn(), params.ticker);
    if (!co) throw new ApiError(404, "company_not_found", `Company "${params.ticker}" is not stored. Add it by ticker from the home page.`);
    return { company: co };
  });
