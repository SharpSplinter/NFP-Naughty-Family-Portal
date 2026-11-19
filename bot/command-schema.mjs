// Canonical guild commands retained by the private daily-summary bot.
import { linkCommand } from "./commands/link.mjs";
import { linkcodeCommand } from "./commands/link-code.mjs";
import { statusCommand } from "./commands/status.mjs";
import { unlinkCommand } from "./commands/unlink.mjs";

// These four commands exist only to link, inspect, or remove a private DM recipient.
export const commands = [linkCommand, linkcodeCommand, statusCommand, unlinkCommand];
