import React from "react"
import { Box, Text, useInput } from "ink"
import { PendingAction } from "../types.js"

type QuestionModalProps = {
  action: PendingAction
  onConfirm: () => void
  onCancel: () => void
}

export function QuestionModal({ action, onConfirm, onCancel }: QuestionModalProps) {
  useInput((_input, key) => {
    if (key.return) onConfirm()
    if (key.escape) onCancel()
  })

  return (
    <Box flexDirection="column" padding={1}>
      {action.kind === "question" ? (
        <QuestionPreview question={action.question} options={action.options} />
      ) : (
        <ToolPreview description={action.description} />
      )}
      <Box marginTop={1}>
        <Text dimColor>enter: resume · esc: cancel</Text>
      </Box>
    </Box>
  )
}

function ToolPreview({ description }: { description: string }) {
  return (
    <Box flexDirection="column">
      <Text color="blue" bold>Claude is waiting for permission:</Text>
      <Text color="yellow">{description}</Text>
    </Box>
  )
}

function QuestionPreview({ question, options }: { question: string; options: Array<{ label: string; description: string }> }) {
  return (
    <Box flexDirection="column">
      <Text color="blue" bold>Claude is asking:</Text>
      <Text color="yellow">{question}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Box key={i} paddingX={1}>
            <Box flexDirection="column">
              <Text bold>{opt.label}</Text>
              <Text dimColor>{opt.description}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
