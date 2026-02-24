import React from "react"
import { Box, Text } from "ink"

type ScrollbarProps = {
  totalItems: number
  visibleCount: number
  scrollOffset: number
  height: number
}

export function Scrollbar({ totalItems, visibleCount, scrollOffset, height }: ScrollbarProps) {
  if (totalItems <= visibleCount) return null

  const thumbSize = Math.max(1, Math.round((visibleCount / totalItems) * height))
  const thumbStart = Math.round((scrollOffset / (totalItems - visibleCount)) * (height - thumbSize))

  const lines = Array.from({ length: height }, (_, i) => {
    const inThumb = i >= thumbStart && i < thumbStart + thumbSize
    return inThumb ? "┃" : "│"
  })

  return (
    <Box flexDirection="column" marginLeft={1}>
      {lines.map((char, i) => (
        <Text key={i} color={char === "┃" ? "cyan" : "gray"}>{char}</Text>
      ))}
    </Box>
  )
}
