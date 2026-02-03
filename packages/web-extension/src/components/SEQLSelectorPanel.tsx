// packages/web-extension/src/components/SEQLSelectorPanel.tsx
import { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Button,
  HStack,
  Text,
  IconButton,
  Collapse,
} from '@chakra-ui/react';
import { MdExpandMore, MdExpandLess } from 'react-icons/md';
import type Replayer from '@appsurify-testmap/rrweb-player';

interface SEQLSelectorPanelProps {
  playerRef: React.RefObject<Replayer | null>;
}

export default function SEQLSelectorPanel({ playerRef }: SEQLSelectorPanelProps) {
  const [selectorInput, setSelectorInput] = useState('');
  const [allMatches, setAllMatches] = useState<Node[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [originalStyles, setOriginalStyles] = useState<Map<Node, string>>(new Map());

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const highlightNode = useCallback((node: Node) => {
    // Clear any existing highlights first
    originalStyles.forEach((originalStyle, highlightedNode) => {
      if (highlightedNode.nodeType === Node.ELEMENT_NODE) {
        const element = highlightedNode as HTMLElement;
        if (originalStyle) {
          element.setAttribute('style', originalStyle);
        } else {
          element.removeAttribute('style');
        }
      }
    });
    setOriginalStyles(new Map());

    // Check node is HTMLElement
    if (node.nodeType !== Node.ELEMENT_NODE) {
      setErrorMessage('Selected node is not an HTML element and cannot be highlighted');
      return;
    }

    const element = node as HTMLElement;

    // Store original inline styles
    const originalStyle = element.getAttribute('style') || '';
    setOriginalStyles(new Map([[node, originalStyle]]));

    // Apply highlight styles using !important to override existing styles
    const highlightStyles = {
      outline: '3px solid #FF6B35',
      outlineOffset: '2px',
      backgroundColor: 'rgba(255, 107, 53, 0.1)',
      boxShadow: '0 0 0 4px rgba(255, 107, 53, 0.2)',
      position: 'relative',
      zIndex: '999999',
    };

    // Build style string with !important
    const styleString = Object.entries(highlightStyles)
      .map(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${cssKey}: ${value} !important`;
      })
      .join('; ');

    // Append to existing styles
    const newStyle = originalStyle ? `${originalStyle}; ${styleString}` : styleString;
    element.setAttribute('style', newStyle);

    // Scroll element into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setErrorMessage(null);
  }, [originalStyles]);

  const handleHighlight = useCallback(() => {
    // Check if playerRef is initialized
    if (!playerRef.current) {
      setErrorMessage('Player not ready. Please wait for replay to load.');
      return;
    }

    if (!selectorInput.trim()) {
      setErrorMessage('Please enter a SEQL selector');
      return;
    }

    try {
      // Get Mirror instance
      const mirror = playerRef.current.getMirror();
      if (!mirror) {
        setErrorMessage('Mirror not available. Player may not be fully initialized.');
        return;
      }

      // Get Replayer instance for iframe access
      const replayer = playerRef.current.getReplayer();
      if (!replayer || !replayer.iframe || !replayer.iframe.contentDocument) {
        setErrorMessage('Replay iframe not ready. Please ensure replay is active.');
        return;
      }

      // Call mirror.getNodesBySelector
      const nodes = mirror.getNodesBySelector(selectorInput.trim());

      if (nodes.length === 0) {
        setErrorMessage(`No elements found matching this selector: ${selectorInput}`);
        setAllMatches([]);
        setCurrentMatchIndex(0);
        return;
      }

      // Store matches and highlight first
      setAllMatches(nodes);
      setCurrentMatchIndex(0);
      highlightNode(nodes[0]);
      setErrorMessage(null);
    } catch (error) {
      console.error('Error highlighting selector:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Invalid SEQL selector format');
    }
  }, [playerRef, selectorInput, highlightNode]);

  const handleNextMatch = useCallback(() => {
    if (allMatches.length === 0) {
      setErrorMessage('No matches to navigate. Please highlight a selector first.');
      return;
    }

    // Increment and wrap around
    const nextIndex = (currentMatchIndex + 1) % allMatches.length;
    setCurrentMatchIndex(nextIndex);

    // Check if node is still in DOM
    const nextNode = allMatches[nextIndex];
    if (!nextNode || !nextNode.parentNode) {
      setErrorMessage('Match node no longer in DOM. Trying next match...');
      // Try next in sequence
      const subsequentIndex = (nextIndex + 1) % allMatches.length;
      if (subsequentIndex !== nextIndex) {
        setCurrentMatchIndex(subsequentIndex);
        highlightNode(allMatches[subsequentIndex]);
      }
      return;
    }

    highlightNode(nextNode);
  }, [allMatches, currentMatchIndex, highlightNode]);

  const handleClear = useCallback(() => {
    // Restore original styles
    originalStyles.forEach((originalStyle, node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (originalStyle) {
          element.setAttribute('style', originalStyle);
        } else {
          element.removeAttribute('style');
        }
      }
    });

    // Reset state
    setOriginalStyles(new Map());
    setAllMatches([]);
    setCurrentMatchIndex(0);
    setErrorMessage(null);
  }, [originalStyles]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectorInput(e.target.value);
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleHighlight();
    } else if (e.key === 'Escape') {
      handleClear();
    }
  }, [handleHighlight, handleClear]);

  return (
    <Box borderWidth="1px" borderRadius="md" p={4} mb={4} borderColor="gray.200">
      <Flex justify="space-between" align="center" mb={2}>
        <Heading size="sm">SEQL Selector Debugger</Heading>
        <IconButton
          aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
          icon={isExpanded ? <MdExpandLess /> : <MdExpandMore />}
          onClick={toggleExpand}
          size="sm"
          variant="ghost"
        />
      </Flex>

      <Collapse in={isExpanded} animateOpacity>
        <FormControl mb={2}>
          <FormLabel>SEQL Selector</FormLabel>
          <Input
            value={selectorInput}
            onChange={handleInputChange}
            placeholder="Enter SEQL selector..."
            onKeyDown={handleKeyPress}
          />
        </FormControl>

        <HStack spacing={2} mb={2}>
          <Button onClick={handleHighlight} colorScheme="orange" size="sm">
            Highlight
          </Button>
          <Button
            onClick={handleNextMatch}
            size="sm"
            isDisabled={allMatches.length === 0}
          >
            Next Match
          </Button>
          <Button onClick={handleClear} size="sm" variant="outline">
            Clear
          </Button>
        </HStack>

        {/* Status bar */}
        {allMatches.length > 0 && (
          <Text fontSize="sm" color="green.500">
            Match {currentMatchIndex + 1} of {allMatches.length}
          </Text>
        )}
        {errorMessage && (
          <Text fontSize="sm" color="red.500">
            {errorMessage}
          </Text>
        )}
      </Collapse>
    </Box>
  );
}
