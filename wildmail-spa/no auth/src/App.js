import React, { useEffect, useState, useRef } from 'react';
import {
  IconButton, useColorMode, Flex, Box, Button, Container,
  Heading, Table, Thead, Tbody, Tr, Th, Td, Text, Spinner, useToast,
  Menu, MenuButton, MenuList, MenuItem
} from '@chakra-ui/react';
import axios from 'axios';
import { MoonIcon, SunIcon, StarIcon, ChevronDownIcon, TriangleDownIcon, TriangleUpIcon, RepeatIcon, ArrowUpDownIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import Split from 'react-split';
import './App.css';

// Format a UTC date string to local timezone
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// Color palettes for each theme mode
const palettes = {
  light: {
    containerBg: undefined,
    headerBg: undefined,
    headerColor: undefined,
    stripe: 'gray.50',
    hover: 'blue.50',
    selected: 'blue.100',
    borderColor: undefined,
    headingColor: undefined,
    detailHeadingColor: undefined,
    buttonScheme: undefined,
    menuBg: undefined,
    menuHover: 'gray.100',
  },
  dark: {
    containerBg: undefined,
    headerBg: undefined,
    headerColor: undefined,
    stripe: 'whiteAlpha.50',
    hover: 'whiteAlpha.200',
    selected: 'blue.900',
    borderColor: undefined,
    headingColor: undefined,
    detailHeadingColor: undefined,
    buttonScheme: undefined,
    menuBg: 'gray.700',
    menuHover: 'gray.600',
  },
  vibrant: {
    containerBg: '#fdf2f8',
    headerBg: '#ec4899',
    headerColor: 'white',
    stripe: 'rgba(147, 51, 234, 0.04)',
    hover: '#fce7f3',
    selected: '#fef3c7',
    borderColor: '#f9a8d4',
    headingColor: 'white',
    detailHeadingColor: '#be185d',
    buttonScheme: 'pink',
    menuBg: '#fdf2f8',
    menuHover: '#fce7f3',
  },
};

// Table header component that supports sorting with arrows
function SortableHeader({ field, currentField, asc, onClick, children }) {
  const isActive = field === currentField;
  return (
    <Th cursor="pointer" onClick={() => onClick(field)}>
      <Flex align="center">
        {children}
        {isActive && (asc ? <TriangleUpIcon ml={1} boxSize={3} /> : <TriangleDownIcon ml={1} boxSize={3} />)}
      </Flex>
    </Th>
  );
}

function App() {
  // Theme mode: light | dark | vibrant
  const [themeMode, setThemeMode] = useState(localStorage.getItem('themeMode') || 'light');
  const { setColorMode } = useColorMode();
  const pal = palettes[themeMode];
  const isVibrant = themeMode === 'vibrant';

  // Sync Chakra's color mode (vibrant uses light as base)
  useEffect(() => {
    setColorMode(themeMode === 'dark' ? 'dark' : 'light');
    localStorage.setItem('themeMode', themeMode);
  }, [themeMode, setColorMode]);

  const cycleTheme = () => {
    setThemeMode(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'vibrant' : 'light');
  };

  const themeIcon = themeMode === 'light' ? <MoonIcon /> : themeMode === 'dark' ? <StarIcon /> : <SunIcon />;
  const themeLabel = themeMode === 'light' ? 'Dark mode' : themeMode === 'dark' ? 'Vibrant mode' : 'Light mode';

  // Header button props (white on vibrant pink header)
  const headerBtnProps = isVibrant ? {
    variant: 'outline',
    color: 'white',
    borderColor: 'whiteAlpha.400',
    _hover: { bg: 'whiteAlpha.200' },
  } : {};

  // Main state declarations
  const [emailsByFolder, setEmailsByFolder] = useState({});
  const [folders, setFolders] = useState(['All Inboxes']);
  const [selectedFolder, setSelectedFolder] = useState(localStorage.getItem('selectedFolder') || 'All Inboxes');
  const [filteredEmails, setFilteredEmails] = useState([]);
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [selectedEmail, setSelectedEmail] = useState(() => {
    const saved = localStorage.getItem('selectedEmail');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed;
    }
    return null;
  });
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewHtml, setViewHtml] = useState(true);
  const [splitLayout, setSplitLayout] = useState(localStorage.getItem('splitLayout') || 'vertical');
  const toast = useToast();
  const refreshInterval = useRef(null);
  const selectedFolderRef = useRef(selectedFolder);

  // Restore selectedEmailId from localStorage
  useEffect(() => {
    if (selectedEmail?.id) setSelectedEmailId(selectedEmail.id);
  }, []);

  // Load all email metadata from API
  const loadEmails = async () => {
    setLoading(true);
    try {
      const res = await axios.get(process.env.REACT_APP_API_URL);
      const data = res?.data || {};

      setEmailsByFolder(data);
      const allFolders = Object.keys(data).sort();
      const allEmails = allFolders.flatMap(f => data[f].map(e => ({ ...e, folder: f })));

      setFolders(['All Inboxes', ...allFolders]);

      const currentFolder = selectedFolderRef.current;
      const display = currentFolder === 'All Inboxes'
        ? allEmails
        : data[currentFolder]?.map(e => ({ ...e, folder: currentFolder })) || [];

      setFilteredEmails(sortEmails(display, sortField, sortAsc));
    } catch (err) {
      console.error('Load failed', err);
    } finally {
      setLoading(false);
    }
  };

  // Sort helper
  const sortEmails = (emails, field, asc) => {
    return [...emails].sort((a, b) => {
      const aVal = (a[field] || '').toLowerCase?.() || '';
      const bVal = (b[field] || '').toLowerCase?.() || '';
      return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  };

  // Handle folder selection (just filters, doesn't reload)
  const handleFolderChange = (folder) => {
    setSelectedFolder(folder);
    selectedFolderRef.current = folder;
    localStorage.setItem('selectedFolder', folder);
    setSelectedEmail(null);
    setSelectedEmailId(null);
    localStorage.removeItem('selectedEmail');

    const allEmails = folder === 'All Inboxes'
      ? Object.entries(emailsByFolder).flatMap(([f, list]) => list.map(e => ({ ...e, folder: f })))
      : (emailsByFolder[folder] || []).map(e => ({ ...e, folder }));

    setFilteredEmails(sortEmails(allEmails, sortField, sortAsc));
  };

  // Handle column header click
  const handleSort = (field) => {
    const newAsc = field === sortField ? !sortAsc : true;
    setSortField(field);
    setSortAsc(newAsc);
    setFilteredEmails(sortEmails(filteredEmails, field, newAsc));
  };

  // Handle email row click
  const handleEmailClick = async (email) => {
    setSelectedEmailId(email.id);
    setSelectedEmail(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/email?key=${encodeURIComponent(email.id + '.json')}`);
      const body = await res.json();
      const fullEmail = {
        ...email,
        text: body.text || '[No body]',
        html: body.html || null,
        attachments: body.attachments || []
      };
      setSelectedEmail(fullEmail);
      localStorage.setItem('selectedEmail', JSON.stringify(fullEmail));
    } catch (err) {
      console.error('Fetch email body failed', err);
    }
  };

  // File download helper
  const downloadFile = async (extension) => {
    if (!selectedEmail) return;

    try {
      const key = `${selectedEmail.id}.${extension}`;
      const res = await fetch(`${process.env.REACT_APP_API_URL}/download?key=${encodeURIComponent(key)}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = key.split('/').pop();
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Download failed', description: err.message, status: 'error', duration: 5000, isClosable: true });
    }
  };

  const downloadAttachment = async (filename) => {
    if (!selectedEmail) return;

    try {
      const key = `${selectedEmail.id}_attachments/${filename}`;
      const res = await fetch(`${process.env.REACT_APP_API_URL}/download?key=${encodeURIComponent(key)}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = key.split('/').pop();
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Download failed', description: err.message, status: 'error', duration: 5000, isClosable: true });
    }
  };

  // Initial load and background refresh setup
  useEffect(() => {
    loadEmails();
    refreshInterval.current = setInterval(() => loadEmails(), 60000);
    return () => clearInterval(refreshInterval.current);
  }, []);

  // Toggle split layout between vertical (bottom) and horizontal (side)
  const toggleLayout = () => {
    setSplitLayout(prev => {
      const next = prev === 'vertical' ? 'horizontal' : 'vertical';
      localStorage.setItem('splitLayout', next);
      return next;
    });
  };

  // Compute row background for a given email and index
  const rowBg = (email, idx) => {
    if (email.id === selectedEmailId) return pal.selected;
    if (idx % 2 === 1) return pal.stripe;
    return 'transparent';
  };

  return (
    <Container maxW="100vw" h="100vh" p={0} overflow="hidden" bg={pal.containerBg} display="flex" flexDirection="column">
      <Box
        p={4} borderBottomWidth="1px" display="flex"
        justifyContent="space-between" alignItems="center"
        bg={pal.headerBg} borderColor={pal.borderColor}
        color={pal.headerColor}
        flexShrink={0}
      >
        <Heading size="md" color={pal.headingColor}>Wildmail Inbox</Heading>
        <Flex gap={2}>
          <Button leftIcon={<RepeatIcon />} onClick={loadEmails} {...headerBtnProps}>Refresh</Button>
          <IconButton
            icon={splitLayout === 'vertical' ? <ArrowForwardIcon /> : <ArrowUpDownIcon />}
            onClick={toggleLayout}
            aria-label={splitLayout === 'vertical' ? 'Side layout' : 'Bottom layout'}
            title={splitLayout === 'vertical' ? 'Side layout' : 'Bottom layout'}
            variant="ghost"
            color={isVibrant ? 'white' : undefined}
            _hover={isVibrant ? { bg: 'whiteAlpha.200' } : undefined}
          />
          <IconButton
            icon={themeIcon}
            onClick={cycleTheme}
            aria-label={themeLabel}
            title={themeLabel}
            variant="ghost"
            color={isVibrant ? 'white' : undefined}
            _hover={isVibrant ? { bg: 'whiteAlpha.200' } : undefined}
          />
        </Flex>
      </Box>
      <Box
        p={4} borderBottomWidth="1px" display="flex"
        justifyContent="space-between" alignItems="left"
        borderColor={pal.borderColor}
        flexShrink={0}
      >
        <Menu matchWidth>
          <MenuButton
            as={Button}
            rightIcon={<ChevronDownIcon />}
            w="100%"
            textAlign="left"
            fontWeight="normal"
            borderWidth="1px"
            borderColor={isVibrant ? '#f9a8d4' : undefined}
            variant="outline"
          >
            {selectedFolder}
          </MenuButton>
          <MenuList bg={pal.menuBg} maxH="300px" overflowY="auto">
            {folders.map(folder => (
              <MenuItem
                key={folder}
                onClick={() => handleFolderChange(folder)}
                bg={folder === selectedFolder ? pal.selected : undefined}
                _hover={{ bg: pal.menuHover }}
                fontWeight={folder === selectedFolder ? 'bold' : 'normal'}
              >
                {folder}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      </Box>
      <Split
        key={splitLayout}
        direction={splitLayout}
        sizes={[60, 40]}
        minSize={200}
        style={{
          flex: '1 1 0',
          minHeight: 0,
          display: 'flex',
          flexDirection: splitLayout === 'vertical' ? 'column' : 'row',
        }}
      >
        <div style={{ overflow: 'auto', padding: '16px', minHeight: 0 }}>
          {loading ? (
            <Spinner color={isVibrant ? '#ec4899' : undefined} />
          ) : (
            <Table variant="simple">
              <Thead>
                <Tr>
                  <SortableHeader field="date" currentField={sortField} asc={sortAsc} onClick={handleSort}>Date</SortableHeader>
                  <SortableHeader field="from" currentField={sortField} asc={sortAsc} onClick={handleSort}>From</SortableHeader>
                  <SortableHeader field="to" currentField={sortField} asc={sortAsc} onClick={handleSort}>To</SortableHeader>
                  <SortableHeader field="subject" currentField={sortField} asc={sortAsc} onClick={handleSort}>Subject</SortableHeader>
                </Tr>
              </Thead>
              <Tbody>
                {filteredEmails.map((email, idx) => (
                  <Tr
                    key={email.id}
                    onClick={() => handleEmailClick(email)}
                    bg={rowBg(email, idx)}
                    _hover={{ bg: email.id === selectedEmailId ? pal.selected : pal.hover, cursor: 'pointer' }}
                  >
                    <Td>{formatDate(email.date)}</Td>
                    <Td>{email.from}</Td>
                    <Td>{email.to}</Td>
                    <Td>{email.subject}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>

        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selectedEmail ? (
            <>
              <Box p={4} pb={2} flexShrink={0}>
                <Heading size="sm" mb={2} color={pal.detailHeadingColor}>Email Details</Heading>
                <Text><strong>From:</strong> {selectedEmail.from}</Text>
                <Text><strong>To:</strong> {selectedEmail.to}</Text>
                <Text><strong>Subject:</strong> {selectedEmail.subject}</Text>
                <Text><strong>Date:</strong> {formatDate(selectedEmail.date)}</Text>
                <Flex mt={4} gap={2}>
                  <Button colorScheme={pal.buttonScheme} onClick={() => downloadFile('eml')}>Download .eml</Button>
                  <Button colorScheme={pal.buttonScheme} onClick={() => downloadFile('txt')}>Download .txt</Button>
                  <Button colorScheme={pal.buttonScheme} onClick={() => downloadFile('json')}>Download .json</Button>
                </Flex>
                {selectedEmail.html && (
                  <Button size="xs" mt={2} variant="outline" onClick={() => setViewHtml(v => !v)}
                    colorScheme={isVibrant ? 'purple' : undefined}
                  >
                    {viewHtml ? 'View Plain Text' : 'View HTML'}
                  </Button>
                )}
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <>
                    <Heading size="sm" mt={4} mb={2} color={pal.detailHeadingColor}>Attachments</Heading>
                    <Table size="sm" variant="simple">
                      <Tbody>
                        {selectedEmail.attachments.map((att, index) => (
                          <Tr key={index}>
                            <Td>{att.filename}</Td>
                            <Td>
                              <Button
                                size="sm"
                                colorScheme={pal.buttonScheme}
                                onClick={async () => {
                                  try {
                                    await downloadAttachment(att.filename);
                                  } catch (err) {
                                    toast({
                                      title: 'Download failed',
                                      description: err.message,
                                      status: 'error',
                                      duration: 5000,
                                      isClosable: true
                                    });
                                  }
                                }}
                              >
                                Download
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </>
                )}
              </Box>
              <Box flex="1" minH={0} mx={4} mb={4}>
                {selectedEmail.html && viewHtml ? (
                  <iframe
                    title="Email body"
                    srcDoc={selectedEmail.html}
                    sandbox=""
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                ) : (
                  <Box overflowY="auto" h="100%">
                    <Text whiteSpace="pre-wrap">{selectedEmail.text}</Text>
                  </Box>
                )}
              </Box>
            </>
          ) : (
            <Box p={4}>
              <Text>Select an email to view its details.</Text>
            </Box>
          )}
        </div>
      </Split>
    </Container>
  )
}

export default App;
