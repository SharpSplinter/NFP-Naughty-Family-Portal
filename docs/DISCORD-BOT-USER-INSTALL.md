# Discord bot user installation and private DMs

The four account-management commands are global application commands installed to the **user** context and restricted to **BOT_DM**:

- `/link`
- `/link-code`
- `/status`
- `/unlink`

Users add Naughty Company Bot to their own Discord apps. They do not need Manage Server permission or to add the bot to a server just to use these commands.

## One-time Discord Developer Portal configuration

Discord requires the application owner to enable supported installation contexts in the Developer Portal. This setting is not switched on by registering commands.

1. Open [Naughty Company Bot in the Discord Developer Portal](https://discord.com/developers/applications/1558700958983389254/information).
2. Open **Installation**.
3. Under **Installation Contexts**, enable **User Install**. Keep **Guild Install** enabled if the bot should remain installable in servers for future features.
4. Under **Install Link**, choose **Discord Provided Link**.
5. Under **Default Install Settings**, set **User Install** to the `applications.commands` scope only. No bot scope or server permissions are needed for User Install.
6. Save changes.

The deployment checks that User Install is enabled before touching production. After that check, it sets the User Install OAuth defaults via Discord's application API, registers global commands with `integration_types: [1]` and `contexts: [1]`, and removes this bot's old guild-scoped slash commands. Unrelated commands and context-menu commands are preserved.

## Install link

The explicit user-install URL is:

`https://discord.com/oauth2/authorize?client_id=1558700958983389254&integration_type=1&scope=applications.commands`

A user opens the link, chooses **Add to My Apps**, and then opens a DM with Naughty Company Bot. The four slash commands become available there after Discord propagates the global command registration.

## Runtime privacy

Discord marks these interactions with `context: 1` (`BOT_DM`). Replies in a DM are inherently private, so the Worker does not request the guild-only ephemeral flag for DM responses. Guild-scoped copies of these account commands are removed during registration. The daily summary remains an opt-in private DM and still respects account quiet hours, retry limits, and duplicate-delivery protection.
