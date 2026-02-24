import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"

type RenameModalProps = {
  currentName: string
  onConfirm: (name: string) => void
  onCancel: () => void
  termWidth: number
  termHeight: number
}

export function RenameModal({ currentName, onConfirm, onCancel, termWidth, termHeight }: RenameModalProps) {
  const [value, setValue] = useState(currentName)

  useInput((_input, key) => {
    if (key.escape) onCancel()
  })

  const title = "Rename session"
  const hint = "enter: confirm · esc: cancel"
  const innerWidth = Math.max(title.length + 4, hint.length + 2, 40)
  const hintPad = innerWidth - hint.length - 2
  const topDashes = innerWidth - title.length - 3

  return (
    <Box width={termWidth} height={termHeight} flexDirection="column" justifyContent="center" alignItems="center">
      <Box flexDirection="column">
        <Text color="blue">{"╭─ " + title + " " + "─".repeat(topDashes) + "╮"}</Text>
        <Text color="blue">{"│" + " ".repeat(innerWidth) + "│"}</Text>
        <Text>
          <Text color="blue">{"│ "}</Text>
          <TextInput value={value} onChange={setValue} onSubmit={(v) => onConfirm(v.trim())} />
          <Text color="blue">{" ".repeat(Math.max(0, innerWidth - value.length - 2)) + " │"}</Text>
        </Text>
        <Text color="blue">{"│" + " ".repeat(innerWidth) + "│"}</Text>
        <Text>
          <Text color="blue">{"│ "}</Text>
          <Text dimColor>{hint}</Text>
          <Text color="blue">{" ".repeat(hintPad) + " │"}</Text>
        </Text>
        <Text color="blue">{"╰" + "─".repeat(innerWidth) + "╯"}</Text>
      </Box>
    </Box>
  )
}
