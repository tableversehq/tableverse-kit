import { useState, type FormEvent } from "react";
import type { GameInfo, MatchValues } from "../lib/api.ts";
import {
  buildSetupInput,
  type FieldValue,
  type FormValues,
} from "../lib/setup-input.ts";
import {
  loadStoredValues,
  saveStoredValues,
  type ValueStore,
} from "../lib/stored-values.ts";
import { Brand } from "./logo-cube.tsx";
import { SetupField } from "./setup-field.tsx";
import { Alert, AlertDescription } from "./ui/alert.tsx";
import { Button } from "./ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";
import { Spinner } from "./ui/spinner.tsx";

interface SetupScreenProps {
  game: GameInfo;
  onStart: (match: MatchValues) => Promise<void>;
}

export function SetupScreen({ game, onStart }: SetupScreenProps) {
  const [stored] = useState(() => loadStoredValues(browserStore(), game.name));
  const { min, max } = game.playerBounds;
  const [seats, setSeats] = useState(() =>
    Math.min(Math.max(stored?.seats ?? min, min), max),
  );
  const [seed, setSeed] = useState(stored?.seed ?? "dev");
  const [values, setValues] = useState<FormValues>(stored?.setup ?? {});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const seatChoices = Array.from(
    { length: max - min + 1 },
    (_, index) => min + index,
  );
  const setupFields = game.setupInputSchema?.fields ?? {};

  function updateValue(path: string, value: FieldValue) {
    setValues((current) => ({ ...current, [path]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    let setupInput: Record<string, unknown> | undefined;
    try {
      setupInput = game.setupInputSchema
        ? buildSetupInput(game.setupInputSchema, values)
        : undefined;
    } catch (reason) {
      setError(messageOf(reason));
      return;
    }

    setStarting(true);
    try {
      await onStart({ players: seatRoster(seats), seed, setupInput });
      saveStoredValues(browserStore(), game.name, {
        seats,
        seed,
        setup: values,
      });
    } catch (reason) {
      setError(messageOf(reason));
      setStarting(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="grid w-full max-w-md gap-4">
        <Brand />
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{game.name}</CardTitle>
            <CardDescription>
              Start a local match. You play every seat.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Seats</Label>
                <Select
                  value={String(seats)}
                  onValueChange={(choice) => setSeats(Number(choice ?? min))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {seatChoices.map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="seed">Seed</Label>
                <Input
                  id="seed"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </div>
            </div>

            {Object.keys(setupFields).length > 0 ? (
              <section className="grid gap-3">
                <h2 className="font-heading text-sm font-semibold">
                  Setup input
                </h2>
                {Object.entries(setupFields).map(([name, field]) => (
                  <SetupField
                    key={name}
                    name={name}
                    parent=""
                    field={field}
                    values={values}
                    onChange={updateValue}
                  />
                ))}
              </section>
            ) : null}

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              size="cta"
              className="w-full"
              disabled={starting}
            >
              {starting ? <Spinner data-icon="inline-start" /> : null}
              Start game
            </Button>
          </CardFooter>
        </Card>
      </form>
    </main>
  );
}

function seatRoster(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `p${index + 1}`);
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

const unavailableStore: ValueStore = {
  getItem: () => null,
  setItem: () => {},
};

function browserStore(): ValueStore {
  try {
    return window.localStorage;
  } catch {
    return unavailableStore;
  }
}
