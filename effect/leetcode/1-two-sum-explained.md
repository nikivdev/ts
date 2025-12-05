# Two Sum

Given an array of numbers and a target, find two indices whose values sum to the target. Classic hash map problem - O(n) instead of brute force O(n²).

## How it works

1. Iterate through array once
2. For each number, calculate `complement = target - num`
3. Check if complement exists in hash map (seen before)
4. If yes → return both indices. If no → store current number and index

## Effect-ts usage

| Concept | What it does |
|---------|--------------|
| `Effect.gen` | Generator syntax for composing effects - like async/await but for Effect |
| `Effect.fail` | Create a typed error (here `NoSolutionError`) |
| `HashMap` | Immutable hash map from Effect's standard library |
| `Option` | Safe nullable handling - `Option.isSome()` checks if value exists |
| `Effect.runPromise` | Execute the effect and get a Promise |

## Key insight for interviews

The hash map approach trades space for time. Instead of checking every pair (O(n²)), you store what you've seen and do O(1) lookups.

```
nums = [2, 7, 11, 15], target = 9

i=0: num=2, complement=7, seen={} → not found, store {2→0}
i=1: num=7, complement=2, seen={2→0} → found! return [0,1]
```

For interviews: You don't need Effect - plain TypeScript is fine. But Effect shows you understand functional programming patterns: immutability, typed errors, and composable computations.
