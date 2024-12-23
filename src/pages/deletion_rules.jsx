import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tab,
  Tabs
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import axios from '../lib/axios_instance';
import { toast } from 'react-toastify';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function DeletionRules() {
  const [rules, setRules] = useState([]);
  const [libraries, setLibraries] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentRule, setCurrentRule] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    library_id: '',
    rule_name: '',
    media_type: 'movie',
    days_since_watched: 90,
    warning_days: 3,
    enabled: true,
    exclusions: {}
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [rulesRes, librariesRes, historyRes, statsRes] = await Promise.all([
        axios.get('/deletion/rules'),
        axios.get('/api/libraries'),
        axios.get('/deletion/history'),
        axios.get('/deletion/stats')
      ]);
      setRules(rulesRes.data);
      setLibraries(librariesRes.data);
      setHistory(historyRes.data.items);
      setStats(statsRes.data);
    } catch (error) {
      toast.error('Error loading data');
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleOpenDialog = (rule = null) => {
    if (rule) {
      setFormData(rule);
      setCurrentRule(rule);
    } else {
      setFormData({
        library_id: '',
        rule_name: '',
        media_type: 'movie',
        days_since_watched: 90,
        warning_days: 3,
        enabled: true,
        exclusions: {}
      });
      setCurrentRule(null);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentRule(null);
  };

  const handleInputChange = (e) => {
    const { name, value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'enabled' ? checked : value
    }));
  };

  const handleSubmit = async () => {
    try {
      if (currentRule) {
        await axios.put(`/deletion/rules/${currentRule.ID}`, formData);
        toast.success('Rule updated successfully');
      } else {
        await axios.post('/deletion/rules', formData);
        toast.success('Rule created successfully');
      }
      handleCloseDialog();
      loadData();
    } catch (error) {
      toast.error('Error saving rule');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this rule?')) {
      try {
        await axios.delete(`/deletion/rules/${id}`);
        toast.success('Rule deleted successfully');
        loadData();
      } catch (error) {
        toast.error('Error deleting rule');
      }
    }
  };

  const handleProcessRules = async () => {
    try {
      await axios.post('/deletion/process');
      toast.success('Rule processing triggered successfully');
    } catch (error) {
      toast.error('Error processing rules');
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Rules" />
          <Tab label="History" />
          <Tab label="Statistics" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Rule
          </Button>
          <Button
            variant="outlined"
            onClick={handleProcessRules}
          >
            Process Rules Now
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Library</TableCell>
                <TableCell>Media Type</TableCell>
                <TableCell>Days Since Watched</TableCell>
                <TableCell>Warning Days</TableCell>
                <TableCell>Enabled</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.ID}>
                  <TableCell>{rule.rule_name}</TableCell>
                  <TableCell>{rule.library_name}</TableCell>
                  <TableCell>{rule.media_type}</TableCell>
                  <TableCell>{rule.days_since_watched}</TableCell>
                  <TableCell>{rule.warning_days}</TableCell>
                  <TableCell>
                    <Switch checked={rule.enabled} disabled />
                  </TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleOpenDialog(rule)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDelete(rule.ID)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Library</TableCell>
                <TableCell>Rule</TableCell>
                <TableCell>Last Watched</TableCell>
                <TableCell>Deleted At</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.ID}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{item.library_name}</TableCell>
                  <TableCell>{item.rule_name}</TableCell>
                  <TableCell>{new Date(item.last_watched).toLocaleString()}</TableCell>
                  <TableCell>{new Date(item.deleted_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        {stats && (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6">Overview</Typography>
                  <Typography>Total Deletions: {stats.overview.total_deletions}</Typography>
                  <Typography>Movies Deleted: {stats.overview.movies_deleted}</Typography>
                  <Typography>Shows Deleted: {stats.overview.shows_deleted}</Typography>
                  <Typography>Episodes Deleted: {stats.overview.episodes_deleted}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6">Deletions by Library</Typography>
                  {stats.by_library.map((lib) => (
                    <Typography key={lib.library_name}>
                      {lib.library_name}: {lib.deletions}
                    </Typography>
                  ))}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6">Deletions by Rule</Typography>
                  {stats.by_rule.map((rule) => (
                    <Typography key={rule.rule_name}>
                      {rule.rule_name}: {rule.deletions}
                    </Typography>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </TabPanel>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {currentRule ? 'Edit Rule' : 'New Rule'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Rule Name"
                  name="rule_name"
                  value={formData.rule_name}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Library</InputLabel>
                  <Select
                    name="library_id"
                    value={formData.library_id}
                    onChange={handleInputChange}
                  >
                    {libraries.map((lib) => (
                      <MenuItem key={lib.ID} value={lib.ID}>
                        {lib.NAME}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Media Type</InputLabel>
                  <Select
                    name="media_type"
                    value={formData.media_type}
                    onChange={handleInputChange}
                  >
                    <MenuItem value="movie">Movie</MenuItem>
                    <MenuItem value="show">Show</MenuItem>
                    <MenuItem value="episode">Episode</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Days Since Watched"
                  name="days_since_watched"
                  value={formData.days_since_watched}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Warning Days"
                  name="warning_days"
                  value={formData.warning_days}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <Typography component="div">
                    Enabled
                    <Switch
                      name="enabled"
                      checked={formData.enabled}
                      onChange={handleInputChange}
                    />
                  </Typography>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {currentRule ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
