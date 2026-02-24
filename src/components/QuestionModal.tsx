import React from "react"
import { Box, Text, useInput } from "ink"
import { PendingAction } from "../types.js"

type QuestionModalProps = {
  action: PendingAction
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  termWidth: number
  termHeight: number
}

export function QuestionModal({ action, confirmLabel, onConfirm, onCancel, termWidth, termHeight }: QuestionModalProps) {
  useInput((_input, key) => {
    if (key.return) onConfirm()
    if (key.escape) onCancel()
  })

  const title = action.kind === "question" ? "Claude is asking" : "Claude is waiting for permission"
  const hint = `enter: ${confirmLabel} · esc: cancel`

  const contentLines: Array<{ text: string; color?: string; bold?: boolean; dim?: boolean }> = []

  if (action.kind === "question") {
    contentLines.push({ text: action.question, color: "yellow" })
    contentLines.push({ text: "" })
    action.options.forEach((opt) => {
      contentLines.push({ text: opt.label, bold: true })
      contentLines.push({ text: opt.description, dim: true })
    })
  } else {
    contentLines.push({ text: action.description, color: "magenta" })
  }

  const maxContentWidth = Math.max(
    title.length + 4,
    hint.length + 2,
    ...contentLines.map((l) => l.text.length + 2),
  )
  const innerWidth = maxContentWidth
  const hintPad = innerWidth - hint.length - 2
  const topDashes = innerWidth - title.length - 3

  return (
    <Box width={termWidth} height={termHeight} flexDirection="column" justifyContent="center" alignItems="center">
      <Box flexDirection="column">
        <Text color="blue">{"╭─ " + title + " " + "─".repeat(topDashes) + "╮"}</Text>
        <Text color="blue">{"│" + " ".repeat(innerWidth) + "│"}</Text>
        {contentLines.map((line, i) => (
          <Text key={i}>
            <Text color="blue">{"│ "}</Text>
            <Text color={line.color} bold={line.bold} dimColor={line.dim}>{line.text}</Text>
            <Text color="blue">{" ".repeat(Math.max(0, innerWidth - line.text.length - 2)) + " │"}</Text>
          </Text>
        ))}
        <Text color="blue">{"│" + " ".repeat(innerWidth) + "│"}</Text>
        <Text>
          <Text color="blue">{"│ "}</Text>
          <Text color="cyan">enter</Text><Text dimColor>{`: ${confirmLabel} · `}</Text><Text color="cyan">esc</Text><Text dimColor>: cancel</Text>
          <Text color="blue">{" ".repeat(hintPad) + " │"}</Text>
        </Text>
        <Text color="blue">{"╰" + "─".repeat(innerWidth) + "╯"}</Text>
      </Box>
    </Box>
  )
}
