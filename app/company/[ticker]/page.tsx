import { CompanyView } from "@/components/CompanyView";

export const metadata = { title: "Ballot analysis - Governance Lens" };

export default function CompanyPage({ params }: { params: { ticker: string } }) {
  return <CompanyView ticker={decodeURIComponent(params.ticker)} />;
}
