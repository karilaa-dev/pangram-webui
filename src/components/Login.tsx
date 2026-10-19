import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { api, type Session } from "../lib/api";
import { Logo } from "./Logo";

export function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onSuccess(await api.login(key));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-kumo-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={44} />
          <div>
            <Text variant="heading" size="lg" as="h1">
              ZamWriter
            </Text>
            <Text variant="secondary">Humanize and verify text with StealthGPT and Pangram.</Text>
          </div>
        </div>
        <LayerCard>
          <LayerCard.Secondary className="flex items-center gap-2">
            <LockKeyIcon size={16} />
            Admin sign in
          </LayerCard.Secondary>
          <LayerCard.Primary>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Input
                label="Admin API key"
                description="Set as ADMIN_API_KEY in the server's .env file."
                type="password"
                autoComplete="current-password"
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
                variant={error ? "error" : "default"}
              />
              {error && <Banner variant="error" icon={<WarningCircleIcon weight="fill" />} title={error} />}
              <Button type="submit" variant="primary" loading={busy} disabled={!key.trim()} className="w-full justify-center">
                Sign in
              </Button>
            </form>
          </LayerCard.Primary>
        </LayerCard>
      </div>
    </div>
  );
}
