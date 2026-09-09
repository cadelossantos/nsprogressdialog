# NS Progress Dialog

A client-side progress modal for tracking a backend job directly in the browser
UI — a standalone replacement for the legacy `nsOutputDialog`. It does **not** use
NetSuite's `N/ui/dialog` / Messaging dialogs; it renders a modern, self-contained
modal (and an optional minimized lower-right widget) with its own styling.

Two modes:

- **Auto (Suitelet poll)** — provide a Suitelet that echoes task status; the module
  polls it every second.
- **Manual (controller)** — omit the Suitelet ids; your client script drives the
  progress and completion itself.

Both modes support **record panes**: a list of `{ url, text }` entries that render as
clickable links in the modal and are deduped by `url`, with a `Count:` label, a
per-pane entrance animation, and efficient windowed (virtualized) rendering for very
large lists. Clicking a pane opens the record URL in a new tab.

---

## Navigation & cancellation

The module **never navigates or reloads the page on its own** — that's the
consumer's job. In auto mode `create()` returns a `Promise` you resolve/reject
against; in manual mode you drive a controller. Job outcome and dialog dismissal
are separate concerns:

- **Outcome** (complete/failed) is delivered by the `Promise` — `.then` on
  `COMPLETE`, `.catch` on `FAILED`, timeout, or transport error.
- **Dismissal** (the dialog was closed) is delivered by the `onClose` option — it
  fires whenever the dialog is closed: the modal `X`, the minimized-widget `X`,
  a programmatic `close()`, or the ~3s auto-cleanup after COMPLETE/FAILED
  (`closable:false` + `autoclose:true`). `onClose()` takes no arguments and fires
  at most once per instance.

Closing a `closable` dialog **before** completion rejects the auto `Promise` with a
plain `Error` ("Dialog closed before completion.") — there is no `err.canceled`
flag; treat an early close the same as any other `.catch`. Put close-only logic in
`onClose`, not in `.catch` (`.catch` also runs on real failures).

---

## Usage — Auto (Suitelet poll) mode

Provide `suiteletScriptId` and `suiteletDeploymentId`. `create()` returns a `Promise`
and polls the Suitelet every second until `COMPLETE` (resolves) or `FAILED` (rejects).

```js
nsprogressdialog.create({
  title: 'Saving...',
  suiteletScriptId: 'customscriptid',
  suiteletDeploymentId: 'customdeploymentid',
  message: 'Please wait while the background job finishes.',
  closable: true,            // show the close ✕ in the title bar (default false)
  allowMinimize: true,       // show the minimize ─ button (default false)
  data: { param1: param1, param2: param2 },  // POSTed to the Suitelet as body.data
  onClose: function () {     // fires only on dismissal (modal ✕, mini ✕, or close())
    console.log('dialog dismissed');
  }
})
.then(function () {
  // COMPLETE - consumer owns navigation
  window.location.reload();
})
.catch(function (err) {
  // real FAILED / timeout / transport error / user closed before completion
  alert(err.message);
});
```

> **Non-closable (force wait).** With `closable:false` + `autoclose:true`, the modal
> auto-cleans up ~3s after COMPLETE/FAILED (no navigation — the consumer still owns
> it via the promise). `closable:false` + `autoclose:false` keeps the modal open
> showing the final green/red state with no dismissal — use with care.

---

## Usage — Manual (controller) mode

Omit **both** `suiteletScriptId` and `suiteletDeploymentId`. `create()` returns a
**controller** and does not poll anything. Percentage is auto-computed from counts.

```js
const loader = nsprogressdialog.create({
  title: 'Saving...',
  closable: true,
  autoclose: false
});

loader.update({ processed: 40, total: 100 });  // shows 40%, "40 of 100"
loader.update({ processed: 85 });              // total defaults to 100 -> 85%

// record panes (append / replace)
loader.addPanes([{ url: '/app/record/vendor/5001', text: 'Vendor #5001' }]);
loader.update({ processed: 90, total: 100, panes: [{ url: '/app/record/vendor/5001', text: 'Vendor #5001' }] });

loader.complete();            // green, COMPLETE; consumer then reloads/navigates
loader.fail({ errorMsg: 'Map/Reduce failed.' }); // red, FAILED + error box
loader.close();               // dismiss now (cleanup only; no navigation)
```

> In manual mode there is no stage (hidden). Status is `PROCESSING` while running
> and flips to `COMPLETE`/`FAILED` on `complete()`/`fail()`. `data` is not POSTed
> (there is no Suitelet call) and `statusCheck` is not needed here.
>
> `addPanes()` appends and renders record panes but **never changes status or
> percentage** — it only draws them over whatever state is shown. On success,
> `<your code>` does the reload/navigate (e.g. `window.location.reload()`), not the
> module. An `onClose` option is honored in manual mode too: it fires when the user
> closes the dialog (✕) or when you call `loader.close()`.

---

## Options (`create()`)

| Option                 | Type    | Default        | Notes |
| ---------------------- | ------- | -------------- | ----- |
| `title`                | string  | `'Processing...'` | Modal title. |
| `message`              | string  | `''` | Extra text shown under the header. |
| `closable`             | boolean | `false` | Show close `✕` in the header and on the minimized widget. Closing just dismisses the dialog (no navigation). |
| `onClose`              | function | —        | Called when the dialog is dismissed (modal ✕, minimized-widget ✕, programmatic `close()`, or ~3s auto-cleanup). No arguments; fires at most once per instance. |
| `allowMinimize`        | boolean | `false` | Show minimize `─`. Minimizes to a lower-right live widget; click to re-expand. |
| `autoclose`            | boolean | `true` | Only meaningful with `closable:false`; auto-cleanup ~3s after COMPLETE/FAILED (no navigation). |
| `panes`                | array   | `[]` | Initial list of `{ url, text }` record panes (manual mode; auto mode receives them from the Suitelet). |
| `data`                 | object  | —        | Extra data POSTed to the Suitelet as `body.data` (auto mode; ignored in manual). |
| `maxChecks`            | number  | unlimited | Auto mode: max **successful PROCESSING** polls; if reached without COMPLETE/FAILED, `create()` rejects (timeout). |
| `suiteletScriptId`     | string  | — | Internal id of the status-checking Suitelet (auto mode). |
| `suiteletDeploymentId` | string  | — | Internal id of the Suitelet deployment (auto mode). |
| `mrTaskId`             | string  | `''` | Map/Reduce task id (auto mode). |

> `redirectTo` and `params` **do not exist** in the current module (navigation is
> consumer-owned; the Suitelet payload field is `data`).

---

## Failure & timeout knobs (auto mode)

Two limits govern how long auto polling runs:

- **`maxChecks`** — bounds the number of *successful non-terminal* (`PROCESSING`)
  polls. Default **unlimited**. Stops a genuinely-hung backend (server keeps
  answering, job never finishes).
- **`RETRY_LIMIT` (3)** — bounds *consecutive exceptions* (network/parse errors) on
  the Suitelet call. Errors here do **not** count toward `maxChecks`; 3 failures in
  a row reject `create()`.

---

## Suitelet wiring (auto mode)

In your Suitelet's POST method, parse the JSON body and echo the status payload at
the end:

```js
const body = JSON.parse(request.body);
// body.mrTaskId and body.data (the client's `data` option)

if (mrTaskId) {
  const statusCheckObj = nsprogressdialog.statusCheck(task, mrTaskId, scriptObj.id, scriptObj.deploymentId, [
    { url: '/app/record/salesorder/1001', text: 'SO #1001' },
    { url: '/app/record/salesorder/1002', text: 'SO #1002' }
  ], errorMsg);
  log.debug('statusCheckObj', statusCheckObj);
  response.writeLine(JSON.stringify(statusCheckObj));
}
```

The optional `resultRecords` (5th arg, `[{ url, text }]`) is echoed back as `panes`;
pass the current records on every poll so panes dedup/append and are finalized at
completion. The optional `errorMsg` (6th arg, a string) is echoed in the payload and
rendered in the red error box on failure; when present it is also the rejection
message for `create()`.

---

## `statusCheck` reference

```js
statusCheck(taskModule, mrTaskId, suiteletScriptId, suiteletDeploymentId, resultRecords?, errorMsg?)
```

Returns the payload to echo to the client:

```js
{
  mrTaskId, status, stage,
  pendingCount, totalCount, processedCount, percentage,
  panes,      // normalized [{url, text}]
  errorMsg,   // echoed, if a string
  suiteletScriptId, suiteletDeploymentId
}
```

---

## Visual states

- **pending / running** → animated blue gradient progress bar, Status `PROCESSING`.
- **COMPLETE** → green bar + percentage, Status `COMPLETE`.
- **FAILED** → red bar + percentage, Status `FAILED`, `create()` promise rejects.

**Panes** render below the progress area: appended and deduped by `url`, with a
right-aligned `Count:` label. Each pane enters with a fade/slide animation, staggered
across a batch. Lists above ~200 panes render **virtualized** — only the visible
window (~6 rows) exists in the DOM with spacers, so very large sets (e.g. 2000) stay
smooth to build and scroll. `prefers-reduced-motion` disables the animations.

**Error box** — when a non-empty `errorMsg` is received (echoed by the Suitelet in
auto mode, or via `fail({ errorMsg })` / `update({ errorMsg })` in manual mode), a
red error box appears between the progress area and the panes (max-height,
scrollable) and persists until the dialog is closed.

---

## Browser demo

Open `demo.html` directly in a browser to simulate the module with a mocked
`N/https`. It loads the real `nsprogressdialog.js` and offers:

- **Run Auto** — Suitelet poll; panes grow 10 → 40 → 100 (animated cascade).
- **Run Auto (fail + errorMsg)** — mock sequence ends FAILED with a JSON error.
- **Run Manual** / **Run Manual (fail + errorMsg)** — controller-driven success/error.
- **Run Streaming demo** — streams panes 1-by-1 up to 200, then virtualizes to 2000.
- **Run 2000-row demo** — immediate virtualized 2000-row windowed list.
- **statusCheck()** — prints a sample payload (with `resultRecords` + `errorMsg`).