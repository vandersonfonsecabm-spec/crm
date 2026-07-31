# Multichannel Inbox Foundation

## Purpose

The Inbox is one operational queue for inbound conversations. It does not create
separate workspaces per channel and it does not imply that every channel can send
replies.

## Current Channels

| Channel type | Operator label | Reply behavior |
| --- | --- | --- |
| `SITE_FORM` | Site | Internal notes only |
| `WHATSAPP_META` | WhatsApp | Internal notes only for real channels |
| `INSTAGRAM_META` | Instagram | Internal notes only |
| `MESSENGER_META` | Messenger | Internal notes only |

A simulated reply remains available only when the backend explicitly allows it
and the selected channel is a WhatsApp test channel (`modoTeste=true`). This
exception is an internal test workflow, not outbound delivery.

Channel identification uses the persisted channel type. Display names and loose
text matching must not decide channel semantics.

## Information Architecture

Desktop uses filters, conversation list, and the selected conversation. Customer
and commercial context opens on demand to keep the conversation readable.

Tablet hides the persistent filter column and exposes the same controls in a
drawer. Mobile uses progressive navigation: list first, selected conversation
second, with an explicit return action. The customer context remains a drawer.

Filters supported by the current API can be combined:

- queue scope;
- conversation status;
- responsible user;
- channel;
- SLA;
- Lead reference;
- text search.

Unread-only and priority filters are deferred because the current list contract
does not expose those filters. Channel options are limited to channels present in
the loaded result page until the backend provides a tenant-scoped channel option
endpoint.

## Operational Safety

- No conversation is selected automatically.
- Opening a conversation is the explicit action that marks its unread messages.
- Background polling does not force-scroll an operator who is reading history.
- Long conversations request the latest available message window.
- Inbound-only channels display a visible explanation and never render a send
  action.
- Unknown channel types fail closed with a neutral, explicit label.
- Customer 360 data is loaded only for the selected conversation and only when
  the context drawer is opened.

## Future Channels

Email and Telegram should add explicit channel type mappings and their own reply
capability contracts. They must not inherit reply behavior from another channel.
The unified queue, progressive mobile navigation, filter composition, and
customer context patterns are ready to receive those channels without creating
new Inbox pages.
