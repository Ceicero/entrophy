import type { ExportedCommand } from '../lib/commands';
import { exampleUsage, whoCanUse } from '../lib/commands';
import { Badge } from './Badge';

interface CommandTableProps {
  commands: ExportedCommand[];
}

interface Row {
  key: string;
  fullName: string;
  description: string;
  who: string;
  example: string;
  type: ExportedCommand['type'];
}

function rowsFor(commands: ExportedCommand[]): Row[] {
  const rows: Row[] = [];
  for (const command of commands) {
    if (command.subcommands.length === 0) {
      rows.push({
        key: command.fullName,
        fullName: command.fullName,
        description: command.description,
        who: whoCanUse(command),
        example: exampleUsage(command),
        type: command.type,
      });
      continue;
    }
    for (const sub of command.subcommands) {
      rows.push({
        key: sub.fullName,
        fullName: sub.fullName,
        description: sub.description,
        who: whoCanUse(command),
        example: exampleUsage(sub),
        type: command.type,
      });
    }
  }
  return rows;
}

const TYPE_LABEL: Record<ExportedCommand['type'], string> = {
  slash: 'Slash command',
  user: 'User context menu',
  message: 'Message context menu',
};

export function CommandTable({ commands }: CommandTableProps) {
  const rows = rowsFor(commands);

  if (rows.length === 0) {
    return <p className="text-sm text-grey-3">No commands are registered for this plugin yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">Commands for this plugin</caption>
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-grey-3">
            <th scope="col" className="px-4 py-3 font-medium">
              Command
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Description
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Who can use it
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Example
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
              <td className="px-4 py-3 align-top">
                <code className="text-grey-7">{row.fullName}</code>
                {row.type !== 'slash' && (
                  <div className="mt-1">
                    <Badge>{TYPE_LABEL[row.type]}</Badge>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 align-top text-grey-3">{row.description}</td>
              <td className="px-4 py-3 align-top text-grey-4">{row.who}</td>
              <td className="px-4 py-3 align-top">
                <code className="text-xs text-grey-3">{row.example}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
