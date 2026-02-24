import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { PendingQuestion } from "../types.js"

type QuestionModalProps = {
  question: PendingQuestion
  onSelect: (label: string) => void
  onCancel: () => void
}

export function QuestionModal({ question, onSelect, onCancel }: QuestionModalProps) {
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1))
    }
    if (key.downArrow) {
      setSelected((s) => Math.min(question.options.length - 1, s + 1))
    }
    if (key.return) {
      onSelect(question.options[selected].label)
    }
    if (key.escape) {
      onCancel()
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text color="blue" bold>Claude is asking:</Text>
        <Text color="yellow">{question.question}</Text>
      </Box>
      {question.options.map((opt, i) => {
        const isSelected = i === selected
        return (
          <Box
            key={i}
            borderStyle={isSelected ? "bold" : undefined}
            borderColor={isSelected ? "blue" : undefined}
            paddingX={1}
            marginBottom={i < question.options.length - 1 ? 0 : 0}
          >
            <Text color={isSelected ? "blue" : undefined}>{isSelected ? "> " : "  "}</Text>
            <Box flexDirection="column">
              <Text bold={isSelected}>{opt.label}</Text>
              <Text dimColor>{opt.description}</Text>
            </Box>
          </Box>
        )
      })}
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · enter: select · esc: cancel</Text>
      </Box>
    </Box>
  )
}
