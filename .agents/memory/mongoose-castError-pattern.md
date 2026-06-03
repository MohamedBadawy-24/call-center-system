---
name: Mongoose CastError pattern
description: Routes using findById must guard with isValid() to avoid 500 errors on invalid ObjectId strings
---

## Rule
Any route that takes an `:id` param and passes it to `Model.findById()` must first check:
```js
if (!mongoose.Types.ObjectId.isValid(req.params.id))
  return res.status(404).json({ error: "Not found" });
```

## Why
If a non-ObjectId string (e.g. `"fakeid"`) reaches `findById`, Mongoose throws a `CastError` which falls into the generic `catch` block, returning a misleading 500 "Server error" instead of a clean 404.

## How to apply
Applied to `/surveys/:id/toggle` in this session. Apply same pattern to any new route using `findById(req.params.id)`.
