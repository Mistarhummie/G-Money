import { ActionForm } from "@/components/ActionForm";
import { Card, kes } from "@/components/ui";
import { getDb } from "@/db";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/session";
import { accountBalance, walletHistory, walletOf } from "@/lib/wallet";
import { updateProfileAction } from "../actions";

export default async function ProfilePage() {
  const user = await requireUser();
  const db = await getDb();
  const owed = await accountBalance(db, walletOf(user.id));
  const testFunds = config.testFunds();
  const history = testFunds ? await walletHistory(db, user.id) : [];
  const testAccount = user.phone.startsWith("test:");
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-bold">Your profile</h1>
      {!user.username && (
        <Card className="border-amber-400/40 text-sm text-amber-100">Choose a username to start joining tournaments.</Card>
      )}
      {testFunds && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Test funds</h2>
            <span className="text-2xl font-bold text-amber-200">{kes(owed)}</span>
          </div>
          <p className="text-xs text-white/50">Play money for testing. It can&apos;t be paid in or taken out.</p>
          {history.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-sm">
              {history.map((h, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-white/70">{h.memo}</span>
                  <span className={`font-mono ${h.amountKes >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {h.amountKes >= 0 ? "+" : "−"}
                    {Math.abs(h.amountKes).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Card className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/80">
        {!testAccount && <span>Phone: {user.phone}</span>}
        <span>Matches played: {user.matchesPlayed}</span>
        {!testFunds && <span>Prize balance: {kes(owed)}</span>}
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
      <p className={testAccount ? "hidden" : "text-xs text-white/50"}>
        Prizes are sent to the M-Pesa number on your account. Game IDs must be your own: sharing accounts gets you suspended.
      </p>
    </div>
  );
}
