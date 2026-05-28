import { describe, it, expect } from "bun:test"

function stripCodeBlocks(text: string): string {
  let result = text
  result = result.replace(/```[\s\S]*?```/g, "[CODE BLOCK]")
  result = result.replace(/(?<!`)`([^`\n]+?)`(?!`)/g, "[CODE]")
  return result
}

describe("stripCodeBlocks", () => {
  it("replaces fenced code blocks with [CODE BLOCK]", () => {
    const input = "I tried using ```const x = 1``` but it failed"
    const output = stripCodeBlocks(input)
    expect(output).toBe("I tried using [CODE BLOCK] but it failed")
  })

  it("replaces inline code with [CODE]", () => {
    const input = "Use `const` keyword for constants"
    const output = stripCodeBlocks(input)
    expect(output).toBe("Use [CODE] keyword for constants")
  })

  it("handles multiple code blocks", () => {
    const input = " ```a``` and ```b``` with `c` and `d` "
    const output = stripCodeBlocks(input)
    expect(output).toBe(" [CODE BLOCK] and [CODE BLOCK] with [CODE] and [CODE] ")
  })

  it("handles mixed fenced and inline code", () => {
    const input = "Try ```const x = [1,2,3]``` but `it` didn't work"
    const output = stripCodeBlocks(input)
    expect(output).toBe("Try [CODE BLOCK] but [CODE] didn't work")
  })

  it("passes through text without any code", () => {
    const input = "This is a plain sentence with no code at all"
    const output = stripCodeBlocks(input)
    expect(output).toBe(input)
  })

  it("handles multiline fenced code blocks", () => {
    const input = "Look:\n```\nconst x = 1\nconst y = 2\n```\nSee?"
    const output = stripCodeBlocks(input)
    expect(output).toBe("Look:\n[CODE BLOCK]\nSee?")
  })

  it("handles empty input", () => {
    expect(stripCodeBlocks("")).toBe("")
  })

  it("does not treat triple backticks with content as inline", () => {
    const input = "The ```code``` was wrong"
    const output = stripCodeBlocks(input)
    expect(output).toBe("The [CODE BLOCK] was wrong")
  })

  it("handles code block at start of text", () => {
    const input = "```const x = 1``` is what I tried"
    const output = stripCodeBlocks(input)
    expect(output).toBe("[CODE BLOCK] is what I tried")
  })

  it("handles code block at end of text", () => {
    const input = "I tried ```const x = 1```"
    const output = stripCodeBlocks(input)
    expect(output).toBe("I tried [CODE BLOCK]")
  })
})