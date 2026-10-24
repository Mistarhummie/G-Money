import { ActionForm } from "@/components/ActionForm";
import { Card, kes } from "@/components/ui";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { accountBalance } from "@/lib/tournaments";
import { updateProfileAction } from "../actions";

export default async function ProfilePage() {
  const user = await requireUser();
  const owed = await accountBalance(await getDb(), `user:${user.id}`);
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-bold">Your profile</h1>
      {!user.username && (
        <Card className="border-amber-400/40 text-sm text-amber-100">Choose a username to start joining tournaments.</Card>
      )}
      <Card className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/80">
        <span>Phone: {user.phone}</span>
        <span>Matches played: {user.matchesPlayed}</span>
        <span>Prize balance: {kes(owed)}</span>
      </Card>
      <Card>
        <ActionForm action={updateProfileAction} submitLabel="Save profile">
          <label className="label">
            Username
            <input name="username" defaultValue={user.username ?? ""} required className="input" />
          </label>
          <label className="label">
            eFootball ID
            <input name="efootballId" defaultValue={user.efootballId ?? ""} className="input" />
          </label>
          <label className="label">
            EA FC ID (EA account or PSN/Xbox name)
            <input name="eafcId" defaultValue={user.eafcId ?? ""} className="input" />
          </label>
          <label className="label">
            Lichess username (for chess)
            <input name="lichessUsername" defaultValue={user.lichessUsername ?? ""} className="input" />
          </label>
        </ActionForm>
      </Card>
      <p className="text-xs text-white/50">
        Prizes are sent to the M-Pesa number on your account. Game IDs must be your own: sharing accounts gets you suspended.
      </p>
    </div>
  );
}
