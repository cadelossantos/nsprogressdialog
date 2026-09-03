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

---

## Usage — Auto (Suitelet poll) mode

Provide `suiteletScriptId` and `suiteletDeploymentId`. `create()` returns a `Promise`
and polls the Suitelet until `COMPLETE` or `FAILED`.

### Asynchronous process

```js
return new Promise((resolve, reject) => {
  nsprogressdialog.create({
    title: 'Saving...',
    suiteletScriptId: 'customscriptid',
    suiteletDeploymentId: 'customdeploymentid',
    message: 'Please wait while the background job finishes.',
    closable: true,            // show the close ✕ in the title bar (default false)
    allowMinimize: true,       // show the minimize ─ button (default false)
    redirectTo: '',            // URL to jump to on close; empty reloads the page
    params: { param1: param1, param2: param2 }
  }).then((result) => {
    resolve(true);
  }).catch((error) => {
    alert(error);
    reject(false);
  });
});
```

### Non-closable (force wait / auto-close on finish)

```js
nsprogressdialog.create({
  title: 'Processing...',
  suiteletScriptId: 'customscriptid',
  suiteletDeploymentId: 'customdeploymentid',
  closable: false,             // no close ✕ in the header
  autoclose: true,             // auto-close ~3s after COMPLETE/FAILED, then redirect/reload
  redirectTo: '/app/record/record?',
  params: { param1: param1 }
});
```

> `closable: false` + `autoclose: false` keeps the modal open showing the final
> green/red state with no dismissal — use with care.

---

## Usage — Manual (controller) mode

Omit **both** `suiteletScriptId` and `suiteletDeploymentId`. `create()` returns a
**controller** and does not poll anything. Your client script tracks progress (e.g.
inside a loop or timer) and drives the loader. Percentage is auto-computed from the
count.

```js
const loader = nsprogressdialog.create({
  title: 'Saving...',
  closable: false,
  autoclose: true,
  redirectTo: '/app/record/record?'
});

loader.update({ processed: 40, total: 100 }); // shows 40%, "40 of 100"
loader.update({ processed: 85 });             // total defaults to 100 -> 85%

loader.complete();   // green, Status COMPLETE, then the close flow runs
loader.fail();       // red, Status FAILED, then the close flow runs
loader.close();      // dismiss now (cleanup + redirect/reload)
```

> In manual mode there is no stage (hidden). Status is `PROCESSING` while running
> and flips to `COMPLETE`/`FAILED` on `complete()`/`fail()`. `params` is not POSTed
> (there is no Suitelet call) and `statusCheck` is not needed here.

---

## Options

| Option               | Type    | Default        | Notes |
| -------------------- | ------- | -------------- | ----- |
| `title`              | string  | `'Processing...'` | Modal title. |
| `message`            | string  | `''` | Extra text shown under the header. |
| `closable`           | boolean | `false` | Show close `✕` in the header and on the minimized widget. On close: go to `redirectTo`, else reload. |
| `allowMinimize`      | boolean | `false` | Show minimize `─`. Minimizes to a lower-right live widget; click to re-expand; the widget's close `✕` only appears when `closable` is true. |
| `autoclose`          | boolean | `true` | Only meaningful with `closable:false`; auto-close ~3s after COMPLETE/FAILED, then redirect/reload. |
| `redirectTo`         | string  | `''` | URL to navigate to on close; empty reloads. |
| `params`             | object  | —        | Extra params POSTed to the Suitelet (ignored in manual mode). |
| `maxChecks`          | number  | unlimited | Auto mode: max poll attempts; if reached without COMPLETE/FAILED, `create()` rejects. |
| `suiteletScriptId`   | string  | — | Internal id of the status-checking Suitelet (auto mode). |
| `suiteletDeploymentId` | string | — | Internal id of the Suitelet deployment (auto mode). |
| `mrTaskId`           | string  | `''` | Map/Reduce task id (auto mode). |
| `status`, `stage`, `pendingCount`, `totalCount`, `processedCount`, `percentage` | — | — | Read-only, echoed back by the Suitelet each poll / set via `update()` in manual mode. |

---

## Suitelet wiring (auto mode)

In your Suitelet's POST method, parse the JSON body and echo the status payload at
the end:

```js
const body = JSON.parse(request.body);
// access body.mrTaskId and body.params

if (mrTaskId) {
  const statusCheckObj = nsprogressdialog.statusCheck(task, mrTaskId, scriptObj.id, scriptObj.deploymentId);
  log.debug('statusCheckObj', statusCheckObj);
  response.writeLine(JSON.stringify(statusCheckObj));
}
```

---

## Visual states

- **pending / running** → animated blue gradient progress bar, Status `PROCESSING`.
- **COMPLETE** → green bar + percentage, Status `COMPLETE`.
- **FAILED** → red bar + percentage, Status `FAILED`, `create()` promise rejects.
