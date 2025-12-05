import { Effect, Option, HashMap } from "effect"

// Two Sum: Given an array of integers nums and an integer target,
// return indices of the two numbers such that they add up to target.
// Time: O(n), Space: O(n) using hash map approach

type TwoSumResult = readonly [number, number]

class NoSolutionError {
  readonly _tag = "NoSolutionError"
}

// Pure function to find two sum indices using Effect
const twoSum = (
  nums: readonly number[],
  target: number
): Effect.Effect<TwoSumResult, NoSolutionError> =>
  Effect.gen(function* () {
    // Map from number to its index
    let seen = HashMap.empty<number, number>()

    for (let i = 0; i < nums.length; i++) {
      const num = nums[i] as number
      const complement = target - num

      const foundIndex = HashMap.get(seen, complement)

      if (Option.isSome(foundIndex)) {
        return [foundIndex.value, i] as const
      }

      seen = HashMap.set(seen, num, i)
    }

    return yield* Effect.fail(new NoSolutionError())
  })

// Run examples
const main = Effect.gen(function* () {
  // Example 1: nums = [2,7,11,15], target = 9 -> [0,1]
  const result1 = yield* twoSum([2, 7, 11, 15], 9)
  console.log("Example 1:", result1)

  // Example 2: nums = [3,2,4], target = 6 -> [1,2]
  const result2 = yield* twoSum([3, 2, 4], 6)
  console.log("Example 2:", result2)

  // Example 3: nums = [3,3], target = 6 -> [0,1]
  const result3 = yield* twoSum([3, 3], 6)
  console.log("Example 3:", result3)
})

Effect.runPromise(main)
