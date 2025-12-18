import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MapLoading() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>User Locations</CardTitle>
        <CardDescription>
          Geographic distribution of all user sessions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[500px] w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}
