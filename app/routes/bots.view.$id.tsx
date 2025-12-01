import { useLoaderData } from '@remix-run/react';
import { json } from '@remix-run/cloudflare';
import type { LoaderFunction } from '@remix-run/cloudflare';
import BotDashboard from '~/components/bots/BotDashboard';

export const loader: LoaderFunction = async ({ params }) => {
  return json({ id: params.id });
};

export default function ViewBotPage() {
  const { id } = useLoaderData<{ id: string }>();
  
  return <BotDashboard />;
}
