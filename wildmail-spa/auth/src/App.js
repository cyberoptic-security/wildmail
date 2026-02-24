import React, { useEffect, useState, useRef } from 'react';
import {
  IconButton, useColorMode, Flex, useColorModeValue, Box, Button, Container,
  Heading, Table, Thead, Tbody, Tr, Th, Td, Text, Select, Spinner, useToast
} from '@chakra-ui/react';
import axios from 'axios';
import { MoonIcon, SunIcon, TriangleDownIcon, TriangleUpIcon, RepeatIcon } from '@chakra-ui/icons';
import Split from 'react-split';
import './App.css';

// Format a UTC date string to local timezone
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Dark mode toggle component
function DarkModeToggle() {
  const { colorMode, toggleColorMode } = useColorMode();
  return (
    <IconButton
      icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
      onClick={toggleColorMode}
      aria-label="Toggle Dark Mode"
      variant="ghost"
    />
  );
}

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
  // Main state declarations
  const [emailsByFolder, setEmailsByFolder] = useState({});
  const [folders, setFolders] = useState(['All Inboxes']);
  const [selectedFolder, setSelectedFolder] = useState(localStorage.getItem('selectedFolder') || 'All Inboxes');
  const [filteredEmails, setFilteredEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(() => {
    const saved = localStorage.getItem('selectedEmail');
    return saved ? JSON.parse(saved) : null;
  });
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewHtml, setViewHtml] = useState(true);
  const toast = useToast();
  const rowHoverBg = useColorModeValue('blue.100', 'gray.700');
  const refreshInterval = useRef(null);
  const selectedFolderRef = useRef(selectedFolder);

  // Cognito settings from environment
  const client_id = process.env.REACT_APP_COGNITO_CLIENT_ID;
  const domain = process.env.REACT_APP_COGNITO_DOMAIN;
  const redirect_uri = window.location.origin;

  // Decode JWT to get expiry timestamp
  const getTokenExpiry = (token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000;
    } catch {
      return 0;
    }
  };

  // Try to use refresh_token to get a new id_token
  const refreshToken = async () => {
    const refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) return null;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id,
      refresh_token
    });

    try {
      const res = await fetch(`${domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      if (!res.ok) throw new Error('Refresh failed');
      const json = await res.json();
      localStorage.setItem('id_token', json.id_token);
      return json.id_token;
    } catch (err) {
      console.error('Refresh token failed', err);
      localStorage.clear();
      return null;
    }
  };

  // Ensure the current token is still valid, refresh if not
  const ensureFreshToken = async () => {
    const token = localStorage.getItem('id_token');
    if (!token) return null;
    const expiry = getTokenExpiry(token);
    if (Date.now() > expiry - 60000) {
      return await refreshToken();
    }
    return token;
  };

  // Handle redirect from Cognito login
  const exchangeCodeForToken = async (code) => {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', client_id);
    params.append('code', code);
    params.append('redirect_uri', redirect_uri);

    const res = await fetch(`${domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const json = await res.json();
    localStorage.setItem('id_token', json.id_token);
    if (json.refresh_token) localStorage.setItem('refresh_token', json.refresh_token);
    return json.id_token;
  };

  // Trigger redirect to login if no token
  const redirectToLogin = () => {
    const loginUrl = `${domain}/oauth2/authorize?identity_provider=Microsoft&redirect_uri=${redirect_uri}&response_type=code&client_id=${client_id}&scope=email openid profile`;
    window.location.href = loginUrl;
  };

  // Try to load a token via auth code or refresh
  const authenticate = async () => {
    const code = new URLSearchParams(window.location.search).get('code');
    let token = localStorage.getItem('id_token');

    if (!token && code) {
      token = await exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, '/');
    }

    if (!token) redirectToLogin();
    return token;
  };

  // Make an authenticated request with refresh retry
  const authenticatedRequest = async (axiosConfig) => {
    let token = await ensureFreshToken();
    if (!token) return;

    try {
      return await axios({
        ...axiosConfig,
        headers: {
          ...(axiosConfig.headers || {}),
          Authorization: `Bearer ${token}`
        }
      });
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('id_token');
        redirectToLogin();
      }
      throw err;
    }
  };

  // Load all email metadata from API
  const loadEmails = async () => {
    setLoading(true);
    try {
      await authenticate();
      const res = await authenticatedRequest({ method: 'GET', url: process.env.REACT_APP_API_URL });
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

  // Handle folder dropdown change (just filters, doesn't reload)
  const handleFolderChange = (e) => {
    const folder = e.target.value;
    setSelectedFolder(folder);
    selectedFolderRef.current = folder;
    localStorage.setItem('selectedFolder', folder);
    setSelectedEmail(null);
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
    setSelectedEmail(null);
    try {
      const token = localStorage.getItem('id_token');
      const res = await fetch(`${process.env.REACT_APP_API_URL}/email?key=${encodeURIComponent(email.id + '.json')}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
    const token = localStorage.getItem('id_token');
    if (!token || !selectedEmail) return;

    try {
      const key = `${selectedEmail.id}.${extension}`;
      const res = await fetch(`${process.env.REACT_APP_API_URL}/download?key=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

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
    const token = localStorage.getItem('id_token');
    if (!token || !selectedEmail) return;

    try {
      const key = `${selectedEmail.id}_attachments/${filename}`;
      const res = await fetch(`${process.env.REACT_APP_API_URL}/download?key=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

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


  // Manual logout
  const logout = () => {
    localStorage.clear();
    const logoutUrl = `${domain}/logout?client_id=${client_id}&logout_uri=${redirect_uri}`;
    window.location.href = logoutUrl;
  };

  // Initial load and background refresh setup
  useEffect(() => {
    loadEmails();
    refreshInterval.current = setInterval(() => loadEmails(), 60000);
    return () => clearInterval(refreshInterval.current);
  }, []);

  return (

    <Container maxW="100vw" h="100vh" p={0} overflow="hidden">
      <Box p={4} borderBottomWidth="1px" display="flex" justifyContent="space-between" alignItems="center">
        <Heading size="md">COMail Inbox Viewer</Heading>
        <Flex gap={2}>
          <Button leftIcon={<RepeatIcon />} onClick={loadEmails}>Refresh</Button>
          <DarkModeToggle />
          <Button onClick={logout} colorScheme="red">Sign Out</Button>
        </Flex>
      </Box>
      <Box p={4} borderBottomWidth="1px" display="flex" justifyContent="space-between" alignItems="left">
        <Select mb={1} value={selectedFolder} onChange={handleFolderChange}>
          {folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
        </Select>
      </Box>
      <Split direction="vertical" sizes={[60, 40]} minSize={200} style={{ height: 'calc(100vh - 145px)', display: 'flex', flexDirection: 'column' }}>
        <Box p={4} overflowY="auto">


          {loading ? (
            <Spinner />
          ) : (
            <Table variant="striped" colorScheme="gray">
              <Thead>
                <Tr>
                  <SortableHeader field="date" currentField={sortField} asc={sortAsc} onClick={handleSort}>Date</SortableHeader>
                  <SortableHeader field="from" currentField={sortField} asc={sortAsc} onClick={handleSort}>From</SortableHeader>
                  <SortableHeader field="to" currentField={sortField} asc={sortAsc} onClick={handleSort}>To</SortableHeader>
                  <SortableHeader field="subject" currentField={sortField} asc={sortAsc} onClick={handleSort}>Subject</SortableHeader>
                </Tr>
              </Thead>
              <Tbody>
                {filteredEmails.map(email => (
                  <Tr key={email.id} onClick={() => handleEmailClick(email)} _hover={{ bg: rowHoverBg, cursor: 'pointer' }}>
                    <Td>{formatDate(email.date)}</Td>
                    <Td>{email.from}</Td>
                    <Td>{email.to}</Td>
                    <Td>{email.subject}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>

        <Box
          flex="1"
          overflow="auto"
          display="flex"
          flexDirection="column"
          maxHeight="100%"
        >
          <Box flex="1" overflowY="auto" p={4} pb={8}>
              {selectedEmail ? (
            <>
              <Heading size="sm" mb={2}>Email Details</Heading>
              <Text><strong>From:</strong> {selectedEmail.from}</Text>
              <Text><strong>To:</strong> {selectedEmail.to}</Text>
              <Text><strong>Subject:</strong> {selectedEmail.subject}</Text>
              <Text><strong>Date:</strong> {formatDate(selectedEmail.date)}</Text>
              <Flex mt={4} gap={2}>
                <Button onClick={() => downloadFile('eml')}>Download .eml</Button>
                <Button onClick={() => downloadFile('txt')}>Download .txt</Button>
                <Button onClick={() => downloadFile('json')}>Download .json</Button>
              </Flex>
              {selectedEmail.html && (
                <Button size="xs" mt={2} variant="outline" onClick={() => setViewHtml(v => !v)}>
                  {viewHtml ? 'View Plain Text' : 'View HTML'}
                </Button>
              )}
              {selectedEmail.html && viewHtml ? (
                <Box mt={2} flex="1">
                  <iframe
                    title="Email body"
                    srcDoc={selectedEmail.html}
                    sandbox=""
                    style={{ width: '100%', minHeight: '300px', border: 'none' }}
                    onLoad={(e) => {
                      const doc = e.target.contentDocument;
                      if (doc) e.target.style.height = doc.documentElement.scrollHeight + 'px';
                    }}
                  />
                </Box>
              ) : (
                <Text mt={2} whiteSpace="pre-wrap">{selectedEmail.text}</Text>
              )}
              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <>
                  <Heading size="sm" mt={6} mb={2}>Attachments</Heading>
                  <Table size="sm" variant="simple">
                    <Tbody>
                      {selectedEmail.attachments.map((att, index) => (
                        <Tr key={index}>
                          <Td>{att.filename}</Td>
                          <Td>
                            <Button
                              size="sm"
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
            </>
          ) : (
            <Text>Select an email to view its details.</Text>
          )}
          </Box>
        </Box>
      </Split>
    </Container>
  )
}

export default App;
