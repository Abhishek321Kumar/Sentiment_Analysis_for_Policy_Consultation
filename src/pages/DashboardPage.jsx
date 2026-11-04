import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Users, FileText, Plus, LogOut, CheckCircle2,
  AlertCircle, ShieldCheck, Copy, Check, Eye, Trash2, Edit3,
  Moon, Sun, Send, X, Search, LayoutDashboard, UserCheck,
  FolderKanban, User, ChevronLeft, ChevronRight, Upload,
  Download, Power, Activity, ArrowRight, Filter, Archive,
  CheckSquare, Square, RefreshCw, RotateCw, Calendar
} from 'lucide-react';
import api from '../services/api';
import * as XLSX from 'xlsx';
import LocationFields from '../components/LocationFields';
import CampaignWizard from '../components/campaign/CampaignWizard';
import CampaignDetailsModal from '../components/campaign/CampaignDetailsModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import './DashboardPage.css';
import { getOrgMonogram } from '../utils/monogram';

const PRESET_CATEGORIES = [
  'Employee',
  'Department Head',
  'Faculty',
  'Student',
  'Customer',
  'Supplier',
  'External Partner',
  'Other',
];

const SAMPLE_CSV_CONTENT = `Full Name,Email id,Alternate Email Address,Contact Number,Department,Designation,Employee / Stakeholder ID,Stakeholder Category
Manjula Jain,manjula@ibm.in,,9981239128,Marketing,BDE,IBM0178,Employee
Rahul Kulkarni,rahul.kulkarni@ibm.in,rahul.k.work@gmail.com,9845012303,Finance,Finance Analyst,IBM-EMP-1023,Employee
Divya Srinivasan,divya.srinivasan@ibm.in,,9845012304,Marketing,Marketing Lead,IBM-EMP-1024,Department Head
Sanjay Rao,sanjay.rao@ibm.in,,9845012305,Technology,Technical Architect,IBM-EMP-1025,Employee
Pooja Nair,pooja.nair@ibm.in,pooja.nair.personal@gmail.com,9845012306,Learning and Development,Corporate Trainer,IBM-EMP-1026,Faculty
Kiran Shah,kiran.shah@ibm.in,,9845012307,Operations,Operations Manager,IBM-EMP-1027,Department Head
Vikram Desai,vikram.desai@ibm.in,v.desai.alt@outlook.com,9845012309,Procurement,Vendor Relationship Manager,IBM-SUP-0012,Supplier
Mihir Joshi,mihir.joshi@ibm.in,,9845012310,Learning and Development,Graduate Trainee,IBM-STU-0005,Student`;

// Validation helper: If email references company name/brand, it must match official organisation domain
export function validateOrgEmailDomain(email, orgDomain, orgName) {
  if (!email || !email.includes('@')) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  const cleanEmail = email.toLowerCase().trim();
  const emailDomain = cleanEmail.split('@')[1];
  if (!emailDomain || !emailDomain.includes('.')) {
    return { valid: false, error: 'Email must contain a valid domain (e.g. name@domain.com).' };
  }

  const cleanOrgDomain = (orgDomain || '').toLowerCase().trim().replace(/^@/, '');
  if (!cleanOrgDomain) {
    return { valid: true };
  }

  const orgDomainBase = cleanOrgDomain.split('.')[0];
  const orgNameTokens = (orgName || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 || (orgName && orgName.trim().length <= 3 && t.length >= 2));

  const brandKeys = Array.from(new Set([orgDomainBase, ...orgNameTokens].filter(Boolean)));
  const emailDomainBase = emailDomain.split('.')[0];
  let referencesCompany = false;

  for (const key of brandKeys) {
    if (emailDomainBase === key || emailDomain.startsWith(key + '.') || emailDomain.includes(key)) {
      referencesCompany = true;
      break;
    }
  }

  if (referencesCompany && emailDomain !== cleanOrgDomain) {
    return {
      valid: false,
      error: `Company email must follow the registered domain "@${cleanOrgDomain}". "@${emailDomain}" is not permitted.`
    };
  }

  return { valid: true };
}

// Smart CSV & Excel line parser handling quotes, tabs, semicolons, and resilient to arbitrary header names and missing headers
function parseCsvText(csvString) {
  if (!csvString || typeof csvString !== 'string') return [];
  const rawLines = csvString
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (rawLines.length === 0) return [];

  const splitLine = line => {
    const sep = (line.includes('\t') && !line.includes(',')) ? '\t' : (line.includes(';') && !line.includes(',') ? ';' : ',');
    const res = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        res.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += ch;
      }
    }
    res.push(cur.trim().replace(/^"|"$/g, ''));
    return res;
  };

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  // Step 1: Detect header row (if any) in the first 8 lines
  let bestHeaderIdx = -1;
  let maxHeaderScore = 0;

  for (let i = 0; i < Math.min(rawLines.length, 8); i++) {
    const cols = splitLine(rawLines[i]).map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
    let score = 0;
    if (cols.some(c => c.includes('email') || c.includes('mail'))) score += 3;
    if (cols.some(c => c.includes('name') && !c.includes('org') && !c.includes('file'))) score += 2;
    if (cols.some(c => c.includes('dept') || c.includes('department'))) score += 1;
    if (cols.some(c => c.includes('role') || c.includes('desig') || c.includes('title'))) score += 1;
    if (cols.some(c => c.includes('phone') || c.includes('contact') || c.includes('mobile'))) score += 1;

    if (score >= 3 && score > maxHeaderScore) {
      maxHeaderScore = score;
      bestHeaderIdx = i;
    }
  }

  let headers = [];
  let dataLines = rawLines;

  if (bestHeaderIdx >= 0) {
    headers = splitLine(rawLines[bestHeaderIdx]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    dataLines = rawLines.slice(bestHeaderIdx + 1);
  }

  const findHeaderIdx = matcher => {
    if (!headers.length) return -1;
    return headers.findIndex(h => matcher(h));
  };

  const headerEmailIdx = findHeaderIdx(h => (h.includes('email') || h.includes('mail')) && !h.includes('alt') && !h.includes('personal'));
  const headerAltEmailIdx = findHeaderIdx(h => h.includes('alt') || (h.includes('personal') && h.includes('mail')));
  const headerNameIdx = findHeaderIdx(h => h.includes('name') && !h.includes('org') && !h.includes('dept') && !h.includes('file'));
  const headerPhoneIdx = findHeaderIdx(h => h.includes('phone') || h.includes('contact') || h.includes('mobile') || h.includes('cell'));
  const headerDeptIdx = findHeaderIdx(h => h.includes('depart') || h.includes('dept'));
  const headerDesigIdx = findHeaderIdx(h => h.includes('desig') || h.includes('title') || h.includes('role') || h.includes('post'));
  const headerCatIdx = findHeaderIdx(h => h.includes('categor') || h.includes('group') || h.includes('type'));
  const headerEmpIdIdx = findHeaderIdx(h => h.includes('emp') || (h.includes('id') && !h.includes('email') && !h.includes('valid')));
  const headerStatusIdx = findHeaderIdx(h => h.includes('status'));
  const headerNotesIdx = findHeaderIdx(h => h.includes('note') || h.includes('remark') || h.includes('comment'));

  // Positional fallback for email if header not recognized
  let fallbackEmailIdx = -1;
  let fallbackNameIdx = -1;

  if (headerEmailIdx === -1) {
    const emailCounts = {};
    for (const line of dataLines.slice(0, 15)) {
      const cols = splitLine(line);
      cols.forEach((col, idx) => {
        if (emailRegex.test(col.trim())) {
          emailCounts[idx] = (emailCounts[idx] || 0) + 1;
        }
      });
    }
    let maxCount = 0;
    for (const [idx, count] of Object.entries(emailCounts)) {
      if (count > maxCount) {
        maxCount = count;
        fallbackEmailIdx = parseInt(idx, 10);
      }
    }
    if (fallbackEmailIdx > 0) {
      fallbackNameIdx = 0;
    }
  }

  const parsed = [];

  for (const line of dataLines) {
    const cols = splitLine(line);
    if (!cols.length || cols.every(c => !c)) continue;

    // 1. Resolve email
    let email = '';
    if (headerEmailIdx >= 0 && cols[headerEmailIdx]) {
      const match = cols[headerEmailIdx].match(emailRegex);
      if (match) email = match[0];
    }
    if (!email && fallbackEmailIdx >= 0 && cols[fallbackEmailIdx]) {
      const match = cols[fallbackEmailIdx].match(emailRegex);
      if (match) email = match[0];
    }
    if (!email) {
      for (const col of cols) {
        const match = col.match(emailRegex);
        if (match) {
          email = match[0];
          break;
        }
      }
    }

    // Skip rows with no valid email (e.g. malformed rows, stray headers, titles)
    if (!email) continue;

    // 2. Resolve alternate email
    let alternateEmail = '';
    if (headerAltEmailIdx >= 0 && cols[headerAltEmailIdx]) {
      const match = cols[headerAltEmailIdx].match(emailRegex);
      if (match && match[0].toLowerCase() !== email.toLowerCase()) {
        alternateEmail = match[0];
      }
    }

    // 3. Resolve Full Name
    let fullName = '';
    if (headerNameIdx >= 0 && cols[headerNameIdx]) {
      fullName = cols[headerNameIdx];
    } else if (fallbackNameIdx >= 0 && cols[fallbackNameIdx]) {
      fullName = cols[fallbackNameIdx];
    } else {
      for (let c = 0; c < cols.length; c++) {
        const val = cols[c].trim();
        if (val && !val.includes('@') && !/^\+?[0-9\s-]{7,}$/.test(val) && val.length > 1) {
          fullName = val;
          break;
        }
      }
    }

    if (!fullName) {
      const userPart = email.split('@')[0];
      fullName = userPart.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // 4. Resolve contact
    let contact = '';
    if (headerPhoneIdx >= 0 && cols[headerPhoneIdx]) {
      contact = cols[headerPhoneIdx];
    } else {
      for (const val of cols) {
        const digits = val.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 13) {
          contact = val;
          break;
        }
      }
    }

    // 5. Department, Designation, Category, EmpID, Notes
    const department = (headerDeptIdx >= 0 ? cols[headerDeptIdx] : '') || cols[4] || 'General';
    const designation = (headerDesigIdx >= 0 ? cols[headerDesigIdx] : '') || cols[5] || 'Member';
    const employeeId = (headerEmpIdIdx >= 0 ? cols[headerEmpIdIdx] : '') || (cols[6]?.includes('EMP') || cols[6]?.includes('STU') || cols[6]?.includes('SUP') ? cols[6] : (cols[7]?.includes('EMP') || cols[7]?.includes('STU') || cols[7]?.includes('SUP') ? cols[7] : ''));
    const category = (headerCatIdx >= 0 ? cols[headerCatIdx] : '') || (cols[7] && !cols[7].includes('EMP') ? cols[7] : (cols[6] && !cols[6].includes('EMP') ? cols[6] : 'Employee'));
    const status = (headerStatusIdx >= 0 ? cols[headerStatusIdx] : '') || 'Active';
    const notes = (headerNotesIdx >= 0 ? cols[headerNotesIdx] : '') || '';

    parsed.push({
      fullName: fullName.trim(),
      email: email.trim(),
      alternateEmail: alternateEmail.trim(),
      contact: contact.trim(),
      department: department.trim(),
      designation: designation.trim(),
      category: category.trim(),
      employeeId: employeeId.trim(),
      status: status.trim(),
      notes: notes.trim(),
    });
  }

  return parsed;
}

const SAMPLE_MANAGER_CSV_CONTENT = `Full Name,Phone Number,Official Email,Department,Designation
Hasan Shek,9912812398,shekhasan@ibm.com,Marketing,Digital Marketing Lead
Priya Nair,9000000001,priya.nair@ibm.com,Software,Software Development Manager`;

function parseManagerCsvText(csvString) {
  if (!csvString || typeof csvString !== 'string') return [];
  const rawLines = csvString
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (rawLines.length === 0) return [];

  const splitLine = line => {
    const sep = (line.includes('\t') && !line.includes(',')) ? '\t' : (line.includes(';') && !line.includes(',') ? ';' : ',');
    const res = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        res.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += ch;
      }
    }
    res.push(cur.trim().replace(/^"|"$/g, ''));
    return res;
  };

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  // Detect header row (if any) in the first 8 lines
  let bestHeaderIdx = -1;
  let maxHeaderScore = 0;

  for (let i = 0; i < Math.min(rawLines.length, 8); i++) {
    const cols = splitLine(rawLines[i]).map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
    let score = 0;
    if (cols.some(c => c.includes('email') || c.includes('mail'))) score += 3;
    if (cols.some(c => c.includes('name') && !c.includes('org') && !c.includes('file'))) score += 2;
    if (cols.some(c => c.includes('dept') || c.includes('department'))) score += 1;
    if (cols.some(c => c.includes('role') || c.includes('desig') || c.includes('title'))) score += 1;
    if (cols.some(c => c.includes('phone') || c.includes('contact') || c.includes('mobile'))) score += 1;

    if (score >= 3 && score > maxHeaderScore) {
      maxHeaderScore = score;
      bestHeaderIdx = i;
    }
  }

  let headers = [];
  let dataLines = rawLines;

  if (bestHeaderIdx >= 0) {
    headers = splitLine(rawLines[bestHeaderIdx]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    dataLines = rawLines.slice(bestHeaderIdx + 1);
  }

  const findHeaderIdx = matcher => {
    if (!headers.length) return -1;
    return headers.findIndex(h => matcher(h));
  };

  const headerEmailIdx = findHeaderIdx(h => (h.includes('email') || h.includes('mail')) && !h.includes('alt'));
  const headerNameIdx = findHeaderIdx(h => h.includes('name') && !h.includes('org') && !h.includes('dept') && !h.includes('file'));
  const headerPhoneIdx = findHeaderIdx(h => h.includes('phone') || h.includes('contact') || h.includes('mobile') || h.includes('cell'));
  const headerDeptIdx = findHeaderIdx(h => h.includes('depart') || h.includes('dept'));
  const headerDesigIdx = findHeaderIdx(h => h.includes('desig') || h.includes('title') || h.includes('role') || h.includes('post'));

  // Positional fallback for email if header not recognized
  let fallbackEmailIdx = -1;
  let fallbackNameIdx = -1;

  if (headerEmailIdx === -1) {
    const emailCounts = {};
    for (const line of dataLines.slice(0, 15)) {
      const cols = splitLine(line);
      cols.forEach((col, idx) => {
        if (emailRegex.test(col.trim())) {
          emailCounts[idx] = (emailCounts[idx] || 0) + 1;
        }
      });
    }
    let maxCount = 0;
    for (const [idx, count] of Object.entries(emailCounts)) {
      if (count > maxCount) {
        maxCount = count;
        fallbackEmailIdx = parseInt(idx, 10);
      }
    }
    if (fallbackEmailIdx > 0) {
      fallbackNameIdx = 0;
    }
  }

  const parsed = [];

  for (const line of dataLines) {
    const cols = splitLine(line);
    if (!cols.length || cols.every(c => !c)) continue;

    // 1. Resolve email
    let email = '';
    if (headerEmailIdx >= 0 && cols[headerEmailIdx]) {
      const match = cols[headerEmailIdx].match(emailRegex);
      if (match) email = match[0];
    }
    if (!email && fallbackEmailIdx >= 0 && cols[fallbackEmailIdx]) {
      const match = cols[fallbackEmailIdx].match(emailRegex);
      if (match) email = match[0];
    }
    if (!email) {
      for (const col of cols) {
        const match = col.match(emailRegex);
        if (match) {
          email = match[0];
          break;
        }
      }
    }

    if (!email) continue;

    // 2. Resolve Full Name
    let fullName = '';
    if (headerNameIdx >= 0 && cols[headerNameIdx]) {
      fullName = cols[headerNameIdx];
    } else if (fallbackNameIdx >= 0 && cols[fallbackNameIdx]) {
      fullName = cols[fallbackNameIdx];
    } else {
      for (let c = 0; c < cols.length; c++) {
        const val = cols[c].trim();
        if (val && !val.includes('@') && !/^\+?[0-9\s-]{7,}$/.test(val) && val.length > 1) {
          fullName = val;
          break;
        }
      }
    }
    if (!fullName) {
      const userPart = email.split('@')[0];
      fullName = userPart.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // 3. Resolve phone
    let contactRaw = '';
    if (headerPhoneIdx >= 0 && cols[headerPhoneIdx]) {
      contactRaw = cols[headerPhoneIdx];
    } else {
      for (const val of cols) {
        const digits = val.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 13) {
          contactRaw = val;
          break;
        }
      }
    }
    const phone = contactRaw.replace(/\D/g, '');

    // 4. Resolve Department & Designation
    const department = (headerDeptIdx >= 0 ? cols[headerDeptIdx] : '') || cols[2] || 'Operations';
    const designation = (headerDesigIdx >= 0 ? cols[headerDesigIdx] : '') || cols[3] || 'Campaign Manager';

    const isValidPhone = /^[0-9]{10}$/.test(phone);
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isValid = Boolean(fullName && isValidEmail && department && designation && isValidPhone);

    parsed.push({
      fullName: fullName.trim(),
      email: email.trim(),
      department: department.trim(),
      designation: designation.trim(),
      phone,
      contactRaw,
      isValid,
      validationError: !fullName ? 'Missing name'
        : !isValidEmail ? 'Invalid email'
        : !department ? 'Missing department'
        : !designation ? 'Missing designation'
        : !isValidPhone ? 'Phone must be 10 digits'
        : ''
    });
  }

  return parsed;
}

export default function DashboardPage() {
  const { user, logout, isAdmin, isManager, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Sidebar collapse & active view
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Strict role separation: Administrators and Campaign Managers operate in dedicated portals
  const portalMode = isAdmin ? 'ADMIN' : 'MANAGER';
  const [activeView, setActiveView] = useState('dashboard');

  // ── Core Data States ──
  const [stats, setStats] = useState({
    totalCampaignManagers: 0,
    totalStakeholders: 0,
    activeStakeholders: 0,
    totalCampaigns: 0,
    activeCampaigns: 0,
    completedCampaigns: 0,
    draftCampaigns: 0,
    totalFeedbackSubmissions: 0,
    myTotalCampaigns: 0,
    myActiveCampaigns: 0,
    myCompletedCampaigns: 0,
    myDraftCampaigns: 0,
    myFeedbackSubmissions: 0,
  });
  const [activities, setActivities] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [deletedCampaigns, setDeletedCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  const [managers, setManagers] = useState([]);
  const [stakeholders, setStakeholders] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // ── Filters & Search States ──
  // Campaign Managers View Filters
  const [managerSearch, setManagerSearch] = useState('');
  const [managerDeptFilter, setManagerDeptFilter] = useState('ALL');
  const [managerStatusFilter, setManagerStatusFilter] = useState('ALL');
  const [managerDateFilter, setManagerDateFilter] = useState('ALL');
  const [filterByManagerId, setFilterByManagerId] = useState(null);

  // Central Stakeholder Directory Filters
  const [shSearch, setShSearch] = useState('');
  const [shDeptFilter, setShDeptFilter] = useState('ALL');
  const [shDesigFilter, setShDesigFilter] = useState('ALL');
  const [shCatFilter, setShCatFilter] = useState('ALL');
  const [shStatusFilter, setShStatusFilter] = useState('ALL');

  // Campaigns View Filters
  const [campaignSubTab, setCampaignSubTab] = useState('active'); // 'active' | 'deleted'
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('ALL');
  const [campaignDateFrom, setCampaignDateFrom] = useState('');
  const [campaignDateTo, setCampaignDateTo] = useState('');

  // ── Create Campaign Page / Modal State ──
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    description: '',
    objectives: '',
    openingDate: '',
    closingDate: '',
    questions: [''],
  });
  const [createSelectedShIds, setCreateSelectedShIds] = useState([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerDept, setPickerDept] = useState('ALL');
  const [pickerDesig, setPickerDesig] = useState('ALL');
  const [pickerCat, setPickerCat] = useState('ALL');

  // ── Modals State ──
  const [showInviteManagerModal, setShowInviteManagerModal] = useState(false);
  const [inviteManagerForm, setInviteManagerForm] = useState({
    fullName: '',
    email: '',
    department: '',
    designation: '',
    phone: '',
  });
  const [inviteManagerErrors, setInviteManagerErrors] = useState({});
  const [invitingManager, setInvitingManager] = useState(false);
  const [resendingInviteEmail, setResendingInviteEmail] = useState(null);

  // Bulk Manager CSV Import Modal State
  const [showBulkManagerCsvModal, setShowBulkManagerCsvModal] = useState(false);
  const [managerCsvRawText, setManagerCsvRawText] = useState('');
  const [managerCsvPreviewRows, setManagerCsvPreviewRows] = useState([]);
  const [managerUploadedFileName, setManagerUploadedFileName] = useState('');
  const [importingManagerCsv, setImportingManagerCsv] = useState(false);

  const [showEditManagerModal, setShowEditManagerModal] = useState(false);
  const [editingManager, setEditingManager] = useState(null);
  const [editManagerForm, setEditManagerForm] = useState({
    fullName: '',
    email: '',
    department: '',
    designation: '',
    phone: '',
  });

  const [showStakeholderModal, setShowStakeholderModal] = useState(false);
  const [editingStakeholder, setEditingStakeholder] = useState(null);
  const [stakeholderForm, setStakeholderForm] = useState({
    fullName: '',
    email: '',
    alternateEmail: '',
    contact: '',
    department: '',
    designation: '',
    category: 'Employee',
    customCategory: '',
    employeeId: '',
    status: 'Active',
    notes: '',
  });
  const [stakeholderFormErrors, setStakeholderFormErrors] = useState({});

  // Bulk CSV Import Modal
  const [showBulkCsvModal, setShowBulkCsvModal] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);

  // Edit Campaign Modal
  const [showEditCampaignModal, setShowEditCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [savingCampaign, setSavingCampaign] = useState(false);

  // Campaign Details & Stakeholder Participation Modal
  const [showCampaignDetailsModal, setShowCampaignDetailsModal] = useState(false);
  const [campaignDetails, setCampaignDetails] = useState(null);
  const [loadingCampaignDetails, setLoadingCampaignDetails] = useState(false);

  // Manage Draft Participants Modal
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [managingCampaign, setManagingCampaign] = useState(null);
  const [selectedStakeholderIds, setSelectedStakeholderIds] = useState([]);

  // Delete Campaign Confirmation Modal (with Reason)
  const [showDeleteCampaignModal, setShowDeleteCampaignModal] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(null);
  const [deletionReason, setDeletionReason] = useState('');

  // Responses Modal
  const [showResponsesModal, setShowResponsesModal] = useState(false);
  const [responsesData, setResponsesData] = useState(null);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [responsesPage, setResponsesPage] = useState(1);

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    department: user?.department || '',
    designation: user?.designation || '',
    phone: user?.phone || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Organisation Profile State (Admin view & edit)
  const [orgProfile, setOrgProfile] = useState(null);
  const [orgForm, setOrgForm] = useState({
    name: user?.orgName || '',
    displayName: user?.displayName || '',
    orgType: user?.orgType || 'Private Company',
    industry: user?.industry || 'Information Technology',
    website: user?.website || '',
    logoUrl: user?.logoUrl || '',
    description: user?.description || '',
    yearEstablished: user?.yearEstablished || '',
    domain: user?.domain || '',
    country: user?.country || '',
    state: user?.state || '',
    city: user?.city || '',
    registeredAddress: '',
    postalCode: '',
    contactEmail: user?.email || '',
    contactNumber: user?.phone || '',
    size: user?.size || 'Medium (51–250 employees)',
    employeeCount: user?.employeeCount || '',
    departmentCount: user?.departmentCount || '',
    branchCount: user?.branchCount || '',
    primaryDepartments: [],
    organisationStructure: user?.organisationStructure || 'Centralised',
  });
  const [customOrgDept, setCustomOrgDept] = useState('');
  const [savingOrgProfile, setSavingOrgProfile] = useState(false);
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);

  // Toast & Clipboard
  const [uiMessage, setUiMessage] = useState({ text: '', type: 'success' });
  const [copiedCode, setCopiedCode] = useState(false);

  const showToast = (text, type = 'success') => {
    setUiMessage({ text, type });
    setTimeout(() => setUiMessage({ text: '', type: 'success' }), 4200);
  };

  // Sync profile form when user updates
  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        department: user.department || '',
        designation: user.designation || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  // ── Data Fetching ──
  const fetchStatsAndActivity = async () => {
    try {
      const [statsRes, actRes] = await Promise.all([
        api.get('/members/stats'),
        isAdmin ? api.get('/members/activity') : Promise.resolve({ activities: [] }),
      ]);
      if (statsRes?.stats) setStats(statsRes.stats);
      if (actRes?.activities) setActivities(actRes.activities);
    } catch (err) {
      console.warn('Failed to fetch dashboard stats:', err.message);
    }
  };

  const fetchCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const res = await api.get('/campaigns');
      setCampaigns(res.campaigns || []);
      setDeletedCampaigns(res.deletedCampaigns || []);
      setLoadingCampaigns(false);
    } catch (err) {
      setLoadingCampaigns(false);
      showToast(err.message, 'error');
    }
  };

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const res = await api.get('/members');
      setManagers(res.managers || []);
      setStakeholders(res.stakeholders || []);
      setLoadingMembers(false);
    } catch (err) {
      setLoadingMembers(false);
      showToast(err.message, 'error');
    }
  };

  const fetchOrgProfile = async () => {
    try {
      const res = await api.get('/organisation/profile');
      if (res?.organisation) {
        const o = res.organisation;
        setOrgProfile(o);
        setOrgForm({
          name: o.name || '',
          displayName: o.displayName || '',
          orgType: o.orgType || 'Private Company',
          industry: o.industry || 'Information Technology',
          website: o.website || '',
          logoUrl: o.logoUrl || '',
          description: o.description || '',
          yearEstablished: o.yearEstablished || '',
          domain: o.domain || '',
          country: o.country || '',
          state: o.state || '',
          city: o.city || '',
          registeredAddress: o.registeredAddress || '',
          postalCode: o.postalCode || '',
          contactEmail: o.contactEmail || '',
          contactNumber: o.contactNumber || '',
          size: o.size || 'Medium (51–250 employees)',
          employeeCount: o.employeeCount ?? '',
          departmentCount: o.departmentCount ?? '',
          branchCount: o.branchCount ?? '',
          primaryDepartments: Array.isArray(o.primaryDepartments) ? o.primaryDepartments : [],
          organisationStructure: o.organisationStructure || 'Centralised',
        });
      }
    } catch (err) {
      console.warn('Failed to fetch organisation profile:', err.message);
    }
  };

  const refreshAllData = () => {
    fetchStatsAndActivity();
    fetchCampaigns();
    fetchMembers();
    fetchOrgProfile();
  };

  useEffect(() => {
    refreshAllData();
  }, [activeView, portalMode]);

  // ── Derived Distinct Lists for Filters ──
  const shDepartments = useMemo(
    () => [...new Set(stakeholders.map(s => s.department).filter(Boolean))].sort(),
    [stakeholders]
  );
  const shDesignations = useMemo(
    () => [...new Set(stakeholders.map(s => s.designation).filter(Boolean))].sort(),
    [stakeholders]
  );
  const shCategories = useMemo(
    () => [...new Set(stakeholders.map(s => s.category).filter(Boolean))].sort(),
    [stakeholders]
  );
  const managerDepartments = useMemo(
    () => [...new Set(managers.map(m => m.department).filter(Boolean))].sort(),
    [managers]
  );

  // Filtered Campaign Managers
  const filteredManagers = useMemo(() => {
    return managers.filter(m => {
      const q = managerSearch.toLowerCase().trim();
      const fullName = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
      const matchSearch =
        !q ||
        fullName.includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.phone || '').toLowerCase().includes(q) ||
        (m.department || '').toLowerCase().includes(q);
      const matchDept = managerDeptFilter === 'ALL' || m.department === managerDeptFilter;
      const matchStatus = managerStatusFilter === 'ALL' || m.status === managerStatusFilter;

      let matchDate = true;
      if (managerDateFilter !== 'ALL') {
        const rawDate = m.created_at || m.createdAt;
        if (!rawDate) {
          matchDate = false;
        } else {
          const itemDate = new Date(rawDate);
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          if (managerDateFilter === 'today') {
            matchDate = itemDate >= startOfToday;
          } else if (managerDateFilter === 'last_7') {
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            matchDate = itemDate >= sevenDaysAgo;
          } else if (managerDateFilter === 'last_30') {
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            matchDate = itemDate >= thirtyDaysAgo;
          } else if (managerDateFilter === 'this_month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            matchDate = itemDate >= startOfMonth;
          } else if (managerDateFilter === 'this_year') {
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            matchDate = itemDate >= startOfYear;
          }
        }
      }

      return matchSearch && matchDept && matchStatus && matchDate;
    });
  }, [managers, managerSearch, managerDeptFilter, managerStatusFilter, managerDateFilter]);

  // Filtered Stakeholders (Admin Directory)
  const filteredStakeholders = useMemo(() => {
    return stakeholders.filter(s => {
      const q = shSearch.toLowerCase().trim();
      const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
      const matchSearch =
        !q ||
        fullName.includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.alternate_email || '').toLowerCase().includes(q) ||
        (s.employee_id || '').toLowerCase().includes(q);
      const matchDept = shDeptFilter === 'ALL' || s.department === shDeptFilter;
      const matchDesig = shDesigFilter === 'ALL' || s.designation === shDesigFilter;
      const matchCat = shCatFilter === 'ALL' || s.category === shCatFilter;
      const matchStatus = shStatusFilter === 'ALL' || s.status === shStatusFilter;
      return matchSearch && matchDept && matchDesig && matchCat && matchStatus;
    });
  }, [stakeholders, shSearch, shDeptFilter, shDesigFilter, shCatFilter, shStatusFilter]);

  // Active Stakeholders for Campaign Manager Picker
  const activeStakeholders = useMemo(
    () => stakeholders.filter(s => s.status === 'active' || s.is_active === true),
    [stakeholders]
  );

  const filteredPickerStakeholders = useMemo(() => {
    return activeStakeholders.filter(s => {
      const q = pickerSearch.toLowerCase().trim();
      const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
      const matchSearch =
        !q ||
        fullName.includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.department || '').toLowerCase().includes(q);
      const matchDept = pickerDept === 'ALL' || s.department === pickerDept;
      const matchDesig = pickerDesig === 'ALL' || s.designation === pickerDesig;
      const matchCat = pickerCat === 'ALL' || s.category === pickerCat;
      return matchSearch && matchDept && matchDesig && matchCat;
    });
  }, [activeStakeholders, pickerSearch, pickerDept, pickerDesig, pickerCat]);

  // Filtered Campaigns
  const displayedCampaigns = useMemo(() => {
    const source = campaignSubTab === 'deleted' ? deletedCampaigns : campaigns;
    return source.filter(c => {
      // If in MANAGER mode, my_campaigns shows campaigns created by user (or all org campaigns if they want, let's show all or own)
      if (portalMode === 'MANAGER' && activeView === 'my_campaigns' && !isAdmin) {
        // Non-admin managers see all org campaigns or their own; backend returns org campaigns
      }
      if (filterByManagerId && c.created_by !== filterByManagerId) {
        return false;
      }
      const q = campaignSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.campaign_code || '').toLowerCase().includes(q) ||
        `${c.creator_first_name || ''} ${c.creator_last_name || ''}`.toLowerCase().includes(q);
      const matchStatus = campaignStatusFilter === 'ALL' || c.status === campaignStatusFilter;

      let matchDate = true;
      if (campaignDateFrom) {
        const cDate = c.opening_date ? c.opening_date.slice(0, 10) : '';
        if (cDate < campaignDateFrom) matchDate = false;
      }
      if (campaignDateTo) {
        const cDate = c.opening_date ? c.opening_date.slice(0, 10) : '';
        if (cDate > campaignDateTo) matchDate = false;
      }

      return matchSearch && matchStatus && matchDate;
    });
  }, [campaigns, deletedCampaigns, campaignSubTab, campaignSearch, campaignStatusFilter, campaignDateFrom, campaignDateTo, filterByManagerId, portalMode, activeView, isAdmin]);

  // ── Handlers ──
  const handleCopyOrgCode = () => {
    if (!user?.orgCode) return;
    navigator.clipboard.writeText(user.orgCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Invite Campaign Manager (Option B: Invite Link)
  const validateInviteManager = () => {
    const errs = {};
    if (!inviteManagerForm.fullName.trim()) errs.fullName = 'Full Name is required.';
    if (!inviteManagerForm.email.trim()) {
      errs.email = 'Official Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteManagerForm.email.trim())) {
      errs.email = 'Enter a valid email address.';
    } else {
      const chk = validateOrgEmailDomain(
        inviteManagerForm.email.trim(),
        orgProfile?.domain || user?.domain,
        orgProfile?.name || user?.orgName
      );
      if (!chk.valid) {
        errs.email = chk.error;
      }
    }
    if (!inviteManagerForm.department.trim()) errs.department = 'Department is required.';
    if (!inviteManagerForm.designation.trim()) errs.designation = 'Designation is required.';

    const phoneClean = (inviteManagerForm.phone || '').trim().replace(/\D/g, '');
    if (!phoneClean) {
      errs.phone = 'Contact number is required.';
    } else if (!/^[0-9]{10}$/.test(phoneClean)) {
      errs.phone = 'Contact number must be exactly 10 digits and a number.';
    }
    return errs;
  };

  const handleInviteManager = async e => {
    e.preventDefault();
    const errs = validateInviteManager();
    if (Object.keys(errs).length > 0) {
      setInviteManagerErrors(errs);
      return;
    }
    setInviteManagerErrors({});
    setInvitingManager(true);
    try {
      const res = await api.post('/members/managers', {
        ...inviteManagerForm,
        phone: inviteManagerForm.phone.trim().replace(/\D/g, '')
      });
      showToast(res.message);
      setShowInviteManagerModal(false);
      setInviteManagerForm({ fullName: '', email: '', department: '', designation: '', phone: '' });
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setInvitingManager(false);
    }
  };

  // Bulk Manager CSV Handlers
  const handleManagerCsvTextChange = text => {
    setManagerCsvRawText(text);
    setManagerCsvPreviewRows(parseManagerCsvText(text));
  };

  const handleManagerCsvFileUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setManagerUploadedFileName(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const data = new Uint8Array(evt.target?.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csvText = XLSX.utils.sheet_to_csv(worksheet);
          handleManagerCsvTextChange(csvText);
          showToast(`Imported ${file.name} successfully.`);
        } catch (err) {
          console.error('Excel parse error:', err);
          showToast('Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls file.', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = evt => {
        const content = evt.target?.result || '';
        handleManagerCsvTextChange(String(content));
      };
      reader.readAsText(file);
    }
  };

  const handleDownloadSampleManagerCsv = () => {
    const blob = new Blob([SAMPLE_MANAGER_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'potentpolicy_campaign_managers_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSampleManagerExcel = () => {
    try {
      const data = [
        ['Full Name', 'Phone Number', 'Official Email', 'Department', 'Designation'],
        ['Hasan Shek', '9912812398', 'shekhasan@ibm.com', 'Marketing', 'Digital Marketing Lead'],
        ['Priya Nair', '9000000001', 'priya.nair@ibm.com', 'Software', 'Software Development Manager'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CampaignManagers');
      XLSX.writeFile(wb, 'potentpolicy_campaign_managers_sample.xlsx');
    } catch (err) {
      console.error('Excel export error:', err);
      showToast('Error generating Excel sample file.', 'error');
    }
  };

  const handleConfirmManagerCsvImport = async () => {
    const validRows = managerCsvPreviewRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      showToast('No valid manager rows found to import. Please check errors in the preview table.', 'error');
      return;
    }
    setImportingManagerCsv(true);
    try {
      const res = await api.post('/members/managers/bulk', {
        managers: validRows,
      });
      showToast(res.message);
      setShowBulkManagerCsvModal(false);
      setManagerCsvRawText('');
      setManagerCsvPreviewRows([]);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setImportingManagerCsv(false);
    }
  };

  // Open Edit Manager Modal
  const openEditManager = m => {
    setEditingManager(m);
    setEditManagerForm({
      fullName: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
      email: m.email || '',
      department: m.department || '',
      designation: m.designation || '',
      phone: m.phone || '',
    });
    setShowEditManagerModal(true);
  };

  const handleSaveEditManager = async e => {
    e.preventDefault();
    if (!editingManager?.id) return;
    try {
      const res = await api.put(`/members/managers/${editingManager.id}`, editManagerForm);
      showToast(res.message);
      setShowEditManagerModal(false);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleManagerStatus = async m => {
    if (!m.id) {
      showToast('Pending invitation has not been registered yet.', 'error');
      return;
    }
    const nextStatus = m.status === 'inactive' ? 'ACTIVE' : 'INACTIVE';
    const actionLabel = nextStatus === 'INACTIVE' ? 'Deactivate' : 'Activate';
    if (
      !window.confirm(
        `${actionLabel} Campaign Manager "${m.first_name} ${m.last_name}"? Their historical campaigns and feedback submissions will remain intact.`
      )
    ) {
      return;
    }
    try {
      const res = await api.patch(`/members/managers/${m.id}/status`, { status: nextStatus });
      showToast(res.message);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCopyManagerInviteLink = m => {
    const token = m.token;
    if (!token) {
      showToast('Invitation token not available for this manager.', 'error');
      return;
    }
    const url = `${window.location.origin}/activate-manager?token=${token}`;
    navigator.clipboard.writeText(url);
    showToast('Manager activation link copied to clipboard!');
  };

  const handleResendManagerInvite = async m => {
    const inviteId = m.invitation_id || m.id || m.email;
    if (!inviteId) return;
    setResendingInviteEmail(m.email);
    try {
      const res = await api.post(`/members/managers/invitations/${encodeURIComponent(inviteId)}/resend`, {
        email: m.email
      });
      showToast(res.message);
      refreshAllData();
    } catch (err) {
      const msg = err.data?.error || err.message || '';
      showToast(msg.includes('404') ? `Pending invitation record for ${m.email} not found in this organisation.` : msg, 'error');
    } finally {
      setResendingInviteEmail(null);
    }
  };

  const handleRevokeManagerInvite = async m => {
    const inviteId = m.invitation_id || m.id || m.email;
    if (!inviteId) return;
    if (
      !window.confirm(
        `Revoke and cancel the pending invitation for "${m.full_name}" (${m.email})?`
      )
    ) {
      return;
    }
    try {
      const res = await api.delete(`/members/managers/invitations/${encodeURIComponent(inviteId)}?email=${encodeURIComponent(m.email)}`);
      showToast(res.message);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteManager = async m => {
    if (!m.id) return;
    if (
      !window.confirm(
        `Are you sure you want to remove Campaign Manager "${m.full_name}"? If they have created campaigns, the account will be deactivated instead to preserve consultation audit history.`
      )
    ) {
      return;
    }
    try {
      const res = await api.delete(`/members/managers/${m.id}`);
      showToast(res.message);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Open Add / Edit Stakeholder Modal
  const openAddStakeholder = () => {
    setEditingStakeholder(null);
    setStakeholderFormErrors({});
    setStakeholderForm({
      fullName: '',
      email: '',
      alternateEmail: '',
      contact: '',
      department: '',
      designation: '',
      category: 'Employee',
      customCategory: '',
      employeeId: '',
      status: 'Active',
      notes: '',
    });
    setShowStakeholderModal(true);
  };

  const openEditStakeholder = s => {
    setEditingStakeholder(s);
    setStakeholderFormErrors({});
    const isPreset = PRESET_CATEGORIES.includes(s.category);
    setStakeholderForm({
      fullName: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      email: s.email || '',
      alternateEmail: s.alternate_email || '',
      contact: s.contact || '',
      department: s.department || '',
      designation: s.designation || '',
      category: isPreset ? s.category : 'CUSTOM',
      customCategory: isPreset ? '' : s.category || '',
      employeeId: s.employee_id || '',
      status:
        s.status === 'inactive'
          ? 'Inactive'
          : s.status === 'not_registered'
          ? 'Not Registered'
          : 'Active',
      notes: s.notes || '',
    });
    setShowStakeholderModal(true);
  };

  const validateStakeholder = () => {
    const errors = {};
    const orgDomain = orgProfile?.domain || user?.domain;
    const orgName = orgProfile?.name || user?.orgName;
    const name = (stakeholderForm.fullName || '').trim();
    const email = (stakeholderForm.email || '').trim();
    const altEmail = (stakeholderForm.alternateEmail || '').trim();
    const phone = (stakeholderForm.contact || '').trim();
    const isExternal = ['Customer', 'Supplier', 'External Partner', 'Other'].includes(stakeholderForm.category);

    if (!name) {
      errors.fullName = 'Full Name is required.';
    } else if (name.length < 2) {
      errors.fullName = 'Full Name must be at least 2 characters.';
    }

    if (!email) {
      errors.email = 'Official work email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    } else {
      const chk = validateOrgEmailDomain(email, orgDomain, orgName);
      if (!chk.valid) {
        errors.email = chk.error;
      }
    }

    if (altEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(altEmail)) {
        errors.alternateEmail = 'Please enter a valid alternate email address.';
      } else if (altEmail.toLowerCase() === email.toLowerCase()) {
        errors.alternateEmail = 'Alternate email cannot be identical to the official work email.';
      } else {
        const altChk = validateOrgEmailDomain(altEmail, orgDomain, orgName);
        if (!altChk.valid) {
          errors.alternateEmail = altChk.error;
        }
      }
    }

    if (phone) {
      const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
      const digits10 = cleanPhone.length === 12 && cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone;
      if (!/^\d{10}$/.test(digits10)) {
        errors.contact = 'Contact number must be a valid 10-digit phone number.';
      }
    }

    if (!isExternal) {
      if (!stakeholderForm.department?.trim()) {
        errors.department = 'Department is required for internal stakeholders.';
      }
      if (!stakeholderForm.designation?.trim()) {
        errors.designation = 'Designation is required for internal stakeholders.';
      }
    }

    if (stakeholderForm.category === 'CUSTOM' && !stakeholderForm.customCategory?.trim()) {
      errors.customCategory = 'Please specify the custom category name.';
    }

    return errors;
  };

  const handleSaveStakeholder = async e => {
    e.preventDefault();
    const errors = validateStakeholder();
    if (Object.keys(errors).length > 0) {
      setStakeholderFormErrors(errors);
      showToast('Please correct the highlighted form errors before saving.', 'error');
      return;
    }
    setStakeholderFormErrors({});

    const resolvedCategory =
      stakeholderForm.category === 'CUSTOM'
        ? stakeholderForm.customCategory.trim() || 'Other'
        : stakeholderForm.category;

    const payload = {
      fullName: stakeholderForm.fullName,
      email: stakeholderForm.email,
      alternateEmail: stakeholderForm.alternateEmail,
      contact: stakeholderForm.contact,
      department: stakeholderForm.department,
      designation: stakeholderForm.designation,
      category: resolvedCategory,
      employeeId: stakeholderForm.employeeId,
      status: stakeholderForm.status,
      notes: stakeholderForm.notes,
    };

    try {
      if (editingStakeholder) {
        const res = await api.put(`/members/stakeholders/${editingStakeholder.id}`, payload);
        showToast(res.message);
      } else {
        const res = await api.post('/members/stakeholders', payload);
        showToast(res.message);
      }
      setShowStakeholderModal(false);
      refreshAllData();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    }
  };

  const handleToggleStakeholderStatus = async s => {
    if (s.status === 'not_registered') {
      showToast('Cannot activate: Stakeholder is not registered yet. They must first verify enrollment via the confirmation email and organisation code.', 'error');
      return;
    }
    const nextActive = s.status !== 'active';
    const verb = nextActive ? 'Activate' : 'Deactivate';
    if (
      !window.confirm(
        `${verb} stakeholder "${s.first_name} ${s.last_name}"? ${
          nextActive
            ? 'They will appear again in the selectable list for new consultations.'
            : 'They will not appear in new consultation pickers, while retaining all historical campaign participation and feedback records.'
        }`
      )
    ) {
      return;
    }
    try {
      const res = await api.patch(`/members/stakeholders/${s.id}/status`, { isActive: nextActive });
      showToast(res.message);
      refreshAllData();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    }
  };

  const handleDeleteStakeholder = async s => {
    if (
      !window.confirm(
        `Are you sure you want to delete stakeholder "${s.first_name} ${s.last_name}"? This action permanently removes their directory record.`
      )
    ) {
      return;
    }
    try {
      const res = await api.delete(`/members/stakeholders/${s.id}`);
      showToast(res.message || 'Stakeholder deleted successfully.');
      refreshAllData();
    } catch (err) {
      showToast(err.response?.data?.error || err.message, 'error');
    }
  };

  // CSV / Excel Bulk Import Handlers
  const handleCsvTextChange = text => {
    setCsvRawText(text);
    setCsvPreviewRows(parseCsvText(text));
  };

  const handleCsvFileUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const data = new Uint8Array(evt.target?.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csvText = XLSX.utils.sheet_to_csv(worksheet);
          handleCsvTextChange(csvText);
          showToast(`Imported ${file.name} successfully.`);
        } catch (err) {
          console.error('Excel parse error:', err);
          showToast('Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls file.', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = evt => {
        const content = evt.target?.result || '';
        handleCsvTextChange(String(content));
      };
      reader.readAsText(file);
    }
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'potentpolicy_stakeholders_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSampleExcel = () => {
    try {
      const data = [
        ['Full Name', 'Email id', 'Alternate Email Address', 'Contact Number', 'Department', 'Designation', 'Employee / Stakeholder ID', 'Stakeholder Category'],
        ['Manjula Jain', 'manjula@ibm.in', '', '9981239128', 'Marketing', 'BDE', 'IBM0178', 'Employee'],
        ['Rahul Kulkarni', 'rahul.kulkarni@ibm.in', 'rahul.k.work@gmail.com', '9845012303', 'Finance', 'Finance Analyst', 'IBM-EMP-1023', 'Employee'],
        ['Divya Srinivasan', 'divya.srinivasan@ibm.in', '', '9845012304', 'Marketing', 'Marketing Lead', 'IBM-EMP-1024', 'Department Head'],
        ['Sanjay Rao', 'sanjay.rao@ibm.in', '', '9845012305', 'Technology', 'Technical Architect', 'IBM-EMP-1025', 'Employee'],
        ['Pooja Nair', 'pooja.nair@ibm.in', 'pooja.nair.personal@gmail.com', '9845012306', 'Learning and Development', 'Corporate Trainer', 'IBM-EMP-1026', 'Faculty'],
        ['Kiran Shah', 'kiran.shah@ibm.in', '', '9845012307', 'Operations', 'Operations Manager', 'IBM-EMP-1027', 'Department Head'],
        ['Vikram Desai', 'vikram.desai@ibm.in', 'v.desai.alt@outlook.com', '9845012309', 'Procurement', 'Vendor Relationship Manager', 'IBM-SUP-0012', 'Supplier'],
        ['Mihir Joshi', 'mihir.joshi@ibm.in', '', '9845012310', 'Learning and Development', 'Graduate Trainee', 'IBM-STU-0005', 'Student']
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stakeholders');
      XLSX.writeFile(wb, 'potentpolicy_stakeholders_sample.xlsx');
    } catch (err) {
      console.error('Excel export error:', err);
      showToast('Error generating Excel sample file.', 'error');
    }
  };

  const handleConfirmCsvImport = async () => {
    if (csvPreviewRows.length === 0) {
      showToast('No valid stakeholder rows found to import.', 'error');
      return;
    }
    setImportingCsv(true);
    try {
      const res = await api.post('/members/stakeholders/bulk', {
        stakeholders: csvPreviewRows,
      });
      showToast(res.message);
      setShowBulkCsvModal(false);
      setCsvRawText('');
      setCsvPreviewRows([]);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setImportingCsv(false);
    }
  };

  // Campaign Questions Helpers
  const handleAddQuestion = () => {
    if (campaignForm.questions.length >= 10) return;
    setCampaignForm(p => ({ ...p, questions: [...p.questions, ''] }));
  };

  const handleRemoveQuestion = idx => {
    if (campaignForm.questions.length <= 1) return;
    setCampaignForm(p => ({ ...p, questions: p.questions.filter((_, i) => i !== idx) }));
  };

  const handleQuestionChange = (idx, val) => {
    const updated = [...campaignForm.questions];
    updated[idx] = val;
    setCampaignForm(p => ({ ...p, questions: updated }));
  };

  // Create Campaign (with Integrated Stakeholder Selection)
  const handleCreateCampaign = async e => {
    e.preventDefault();
    try {
      const formattedQuestions = campaignForm.questions
        .filter(q => q.trim().length > 0)
        .map(q => ({ text: q }));

      await api.post('/campaigns', {
        title: campaignForm.title,
        description: campaignForm.description,
        objectives: campaignForm.objectives,
        openingDate: campaignForm.openingDate,
        closingDate: campaignForm.closingDate,
        questions: formattedQuestions,
        stakeholderIds: createSelectedShIds,
      });

      showToast(
        `Campaign created with ${createSelectedShIds.length} assigned stakeholder(s).`
      );
      setCampaignForm({
        title: '',
        description: '',
        objectives: '',
        openingDate: '',
        closingDate: '',
        questions: [''],
      });
      setCreateSelectedShIds([]);
      setActiveView('my_campaigns');
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Open Campaign Details & Stakeholder Participation Status Modal
  const openCampaignDetails = async campId => {
    setLoadingCampaignDetails(true);
    setShowCampaignDetailsModal(true);
    try {
      const res = await api.get(`/campaigns/${campId}`);
      setCampaignDetails(res);
      setLoadingCampaignDetails(false);
    } catch (err) {
      setLoadingCampaignDetails(false);
      showToast(err.message, 'error');
    }
  };

  // Campaign Wizard Draft & Publish Handlers
  const handleSaveCampaignDraft = async payload => {
    setSavingCampaign(true);
    try {
      if (editingCampaign) {
        await api.put(`/campaigns/${editingCampaign.id}`, {
          ...payload,
          status: 'DRAFT',
        });
        showToast('Campaign draft updated successfully.');
      } else {
        await api.post('/campaigns', {
          ...payload,
          status: 'DRAFT',
          publishNow: false,
        });
        showToast(`Campaign saved as Draft with ${payload.stakeholderIds?.length || 0} stakeholder(s) assigned.`);
      }
      try {
        localStorage.removeItem('potentpolicy_wizard_draft_new');
        if (editingCampaign?.id) {
          localStorage.removeItem(`potentpolicy_wizard_draft_edit_${editingCampaign.id}`);
        }
      } catch (e) {}
      setEditingCampaign(null);
      setActiveView(portalMode === 'ADMIN' ? 'all_campaigns' : 'my_campaigns');
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingCampaign(false);
    }
  };

  const handlePublishCampaign = async payload => {
    setSavingCampaign(true);
    try {
      if (editingCampaign) {
        await api.put(`/campaigns/${editingCampaign.id}`, payload);
        await api.post(`/campaigns/${editingCampaign.id}/open`);
        showToast('Campaign published successfully! Stakeholder consultation links are live.');
      } else {
        await api.post('/campaigns', {
          ...payload,
          status: 'OPEN',
          publishNow: true,
        });
        showToast('Campaign published successfully! Stakeholder consultation links are live.');
      }
      try {
        localStorage.removeItem('potentpolicy_wizard_draft_new');
        if (editingCampaign?.id) {
          localStorage.removeItem(`potentpolicy_wizard_draft_edit_${editingCampaign.id}`);
        }
      } catch (e) {}
      setEditingCampaign(null);
      setActiveView(portalMode === 'ADMIN' ? 'all_campaigns' : 'my_campaigns');
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingCampaign(false);
    }
  };

  // Edit Campaign Modal
  const openEditCampaign = async c => {
    try {
      const res = await api.get(`/campaigns/${c.id}`);
      const fullCampaignData = {
        ...res.campaign,
        questions: res.questions,
        participants: res.participants,
      };
      setEditingCampaign(fullCampaignData);

      if (res.campaign.status === 'DRAFT') {
        setActiveView('create_campaign');
      } else {
        setCampaignForm({
          title: res.campaign.title,
          description: res.campaign.description || '',
          objectives: res.campaign.objectives || '',
          openingDate: res.campaign.opening_date ? res.campaign.opening_date.slice(0, 10) : '',
          closingDate: res.campaign.closing_date ? res.campaign.closing_date.slice(0, 10) : '',
          questions: (res.questions || []).map(q => q.question_text),
        });
        setShowEditCampaignModal(true);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveEditCampaign = async e => {
    e.preventDefault();
    try {
      const formattedQuestions = campaignForm.questions
        .filter(q => q.trim().length > 0)
        .map(q => ({ text: q }));
      await api.put(`/campaigns/${editingCampaign.id}`, {
        title: campaignForm.title,
        description: campaignForm.description,
        objectives: campaignForm.objectives,
        openingDate: campaignForm.openingDate,
        closingDate: campaignForm.closingDate,
        questions: formattedQuestions,
      });
      showToast('Campaign updated successfully.');
      setShowEditCampaignModal(false);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Manage Draft Participants Modal
  const openParticipantsPicker = async c => {
    setManagingCampaign(c);
    try {
      const campDetails = await api.get(`/campaigns/${c.id}`);
      const enrolledIds = campDetails.participants.map(p => p.id);
      setSelectedStakeholderIds(enrolledIds);
      if (stakeholders.length === 0) {
        await fetchMembers();
      }
      setShowParticipantsModal(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveParticipants = async () => {
    try {
      await api.put(`/campaigns/${managingCampaign.id}/participants`, {
        stakeholderIds: selectedStakeholderIds,
      });
      showToast(`Assigned ${selectedStakeholderIds.length} stakeholder(s) to campaign.`);
      setShowParticipantsModal(false);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenCampaign = async id => {
    if (
      !window.confirm(
        'Open this campaign? Invitation emails with campaign codes will be dispatched to all selected stakeholders.'
      )
    )
      return;
    try {
      const res = await api.post(`/campaigns/${id}/open`);
      showToast(res.message);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCloseCampaign = async id => {
    if (
      !window.confirm(
        'Complete & close this campaign? No further stakeholder submissions will be accepted.'
      )
    )
      return;
    try {
      const res = await api.post(`/campaigns/${id}/close`);
      showToast(res.message);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete Campaign Modal with Deletion Reason
  const openDeleteCampaignModal = c => {
    const isManagerOnly = !isAdmin;
    if (isManagerOnly && (c.response_count > 0 || c.status === 'CLOSED')) {
      showToast(
        'Campaigns with submitted responses or closed status require Administrator governance to delete.',
        'error'
      );
      return;
    }
    setDeletingCampaign(c);
    setDeletionReason('');
    setShowDeleteCampaignModal(true);
  };

  const handleConfirmDeleteCampaign = async e => {
    e.preventDefault();
    if (!deletingCampaign) return;
    try {
      const res = await api.del(`/campaigns/${deletingCampaign.id}`, {
        deletionReason: deletionReason.trim() || 'Removed via governance dashboard',
      });
      showToast(res.message);
      setShowDeleteCampaignModal(false);
      setDeletingCampaign(null);
      refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openResponsesView = async (campId, page = 1) => {
    setLoadingResponses(true);
    setShowResponsesModal(true);
    setResponsesPage(page);
    try {
      const res = await api.get(`/campaigns/${campId}/responses?page=${page}&limit=10`);
      setResponsesData(res);
      setLoadingResponses(false);
    } catch (err) {
      setLoadingResponses(false);
      showToast(err.message, 'error');
    }
  };

  const handleSaveProfile = async e => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.put('/auth/profile', profileForm);
      updateUser({
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        department: profileForm.department,
        designation: profileForm.designation,
        phone: profileForm.phone,
      });
      setIsEditingPersonal(false);
      showToast(res.message);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleOrgLogoUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo file size must be under 2 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = evt => {
      setOrgForm(p => ({ ...p, logoUrl: String(evt.target?.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveOrgProfile = async e => {
    e.preventDefault();
    setSavingOrgProfile(true);
    try {
      const res = await api.put('/organisation/profile', {
        ...orgForm,
        logo: orgForm.logoUrl,
      });
      const o = res.organisation;
      setOrgProfile(o);
      updateUser({
        orgName: o.name,
        displayName: o.displayName,
        orgType: o.orgType,
        industry: o.industry,
        website: o.website,
        logoUrl: o.logoUrl,
        description: o.description,
        yearEstablished: o.yearEstablished,
        domain: o.domain,
        country: o.country,
        state: o.state,
        city: o.city,
        size: o.size,
        employeeCount: o.employeeCount,
        departmentCount: o.departmentCount,
        branchCount: o.branchCount,
        organisationStructure: o.organisationStructure,
      });
      setIsEditingOrg(false);
      showToast(res.message || 'Organisation profile updated successfully.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingOrgProfile(false);
    }
  };

  // Quick-Cohort Selection Helpers (used in both Create Campaign & Participant Picker)
  const applyCohortSelection = (targetListSetter, currentIds, predicate) => {
    const matchingIds = activeStakeholders.filter(predicate).map(s => s.id);
    const merged = [...new Set([...currentIds, ...matchingIds])];
    targetListSetter(merged);
  };

  // ── Navigation Menu Definitions ──
  const adminMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'managers', label: 'Campaign Managers', icon: UserCheck, badge: stats.totalCampaignManagers },
    { id: 'stakeholders', label: 'Stakeholder Directory', icon: Users, badge: stats.totalStakeholders },
    { id: 'all_campaigns', label: 'All Campaigns', icon: FolderKanban, badge: stats.totalCampaigns },
    { id: 'profile', label: 'Organisation Profile', icon: Building2 },
    { id: 'personal_profile', label: 'Personal Profile', icon: User },
  ];

  const managerMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'my_campaigns', label: 'My Campaigns', icon: FolderKanban, badge: campaigns.length },
    { id: 'create_campaign', label: 'Create Campaign', icon: Plus },
    { id: 'personal_profile', label: 'Profile', icon: User },
  ];

  const activeMenuItems = portalMode === 'ADMIN' ? adminMenuItems : managerMenuItems;

  return (
    <div className="dash-layout">
      {/* ══════════════════════════════════════════════════════════════
          COLLAPSIBLE LEFT SIDEBAR NAVIGATION
         ══════════════════════════════════════════════════════════════ */}
      <aside className={`dash-sidebar ${sidebarCollapsed ? 'dash-sidebar--collapsed' : ''}`}>
        <div className="dash-sidebar__top">
          {!sidebarCollapsed && (
            <Link to="/" className="dash-sidebar__brand">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="7" fill="var(--brand-accent)" />
                <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9" />
                <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)" />
              </svg>
              <span>PotentPolicy</span>
            </Link>
          )}
          <button
            className="dash-sidebar__collapse-btn"
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="dash-sidebar__nav">
          {!sidebarCollapsed && (
            <div className="dash-sidebar__section-label">
              {portalMode === 'ADMIN' ? 'Administrator Menu' : 'Campaign Manager Menu'}
            </div>
          )}

          {activeMenuItems.map(item => {
            const IconComp = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`dash-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setFilterByManagerId(null);
                  if (item.id === 'create_campaign') {
                    setEditingCampaign(null);
                  }
                  setActiveView(item.id);
                }}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <IconComp size={18} style={{ flexShrink: 0 }} />
                {!sidebarCollapsed && (
                  <>
                    <span>{item.label}</span>
                    {typeof item.badge === 'number' && (
                      <span className="dash-nav-item__badge">{item.badge}</span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        <div className="dash-sidebar__footer">
          <button
            type="button"
            className="dash-nav-item dash-nav-item--logout"
            onClick={logout}
            title="Logout"
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════════
          MAIN WORKSPACE AREA
         ══════════════════════════════════════════════════════════════ */}
      <div className="dash-main-wrap">
        {/* ── Top Header ── */}
        <header className="dash-header">
          <div className="dash-header__left">
            <div className="dash-header__org-pill">
              <Building2 size={14} color="var(--brand-accent)" />
              <span>{user?.orgName || 'Institutional Workspace'}</span>
            </div>

            {isAdmin && user?.orgCode && (
              <div
                className="dash-header__org-code"
                onClick={handleCopyOrgCode}
                title="Click to copy confidential Organisation Code"
              >
                <span>Org Code: {user.orgCode}</span>
                {copiedCode ? <Check size={12} color="var(--sentiment-positive)" /> : <Copy size={12} />}
              </div>
            )}
          </div>

          <div className="dash-header__right">
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {user?.roles?.map(r => (
                <span
                  key={r}
                  className={`dash-role-badge ${
                    r === 'ADMIN' ? 'dash-role-badge--admin' : 'dash-role-badge--manager'
                  }`}
                >
                  {r.replace('_', ' ')}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="dash-btn-secondary dash-btn-sm"
              title="Toggle Light / Dark theme"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('personal_profile')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.86rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {user?.firstName} {user?.lastName}
            </button>
          </div>
        </header>

        {/* ── Toast Notification Banner ── */}
        {uiMessage.text && (
          <div
            style={{
              position: 'fixed',
              bottom: '1.5rem',
              right: '1.5rem',
              background: uiMessage.type === 'error' ? 'var(--sentiment-negative)' : '#23272A',
              color: '#ffffff',
              padding: '0.85rem 1.25rem',
              borderRadius: '10px',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              fontSize: '0.86rem',
              fontWeight: '600',
              borderLeft: `4px solid ${
                uiMessage.type === 'error' ? '#fff' : 'var(--brand-accent)'
              }`,
            }}
          >
            {uiMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{uiMessage.text}</span>
          </div>
        )}

        {/* ── Main Content Body ── */}
        <main className="dash-body">
          {/* ══════════════════════════════════════════════════════════
              VIEW 1A: ADMINISTRATOR DASHBOARD
             ══════════════════════════════════════════════════════════ */}
          {portalMode === 'ADMIN' && activeView === 'dashboard' && (
            <div className="animate-fade-in">
              <div className="dash-action-bar">
                <div>
                  <h2 className="dash-title">Administrator Governance Dashboard</h2>
                  <p className="dash-subtitle">
                    Centralised oversight of Campaign Managers, the Stakeholder Directory, and institutional consultations.
                  </p>
                </div>
              </div>

              {/* Company / Institutional Summary & Logo Card */}
              <div className="dash-company-card">
                <div className="dash-company-card__left">
                  <div className="dash-company-logo">
                    {orgProfile?.logoUrl || user?.logoUrl ? (
                      <img
                        src={orgProfile?.logoUrl || user?.logoUrl}
                        alt={orgProfile?.name || user?.orgName || 'Organisation Logo'}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      getOrgMonogram(orgProfile?.name || user?.orgName)
                    )}
                  </div>
                  <div className="dash-company-info">
                    <h3 className="dash-company-info__name">
                      {orgProfile?.name || user?.orgName || 'Institutional Workspace'}
                      {(orgProfile?.displayName || user?.displayName) && (
                        <span style={{ fontWeight: '500', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                          ({orgProfile?.displayName || user?.displayName})
                        </span>
                      )}
                    </h3>
                    {(() => {
                      const rawDesc = orgProfile?.description || user?.description || '';
                      if (!rawDesc) return null;
                      const shortDesc = rawDesc.length > 175 ? `${rawDesc.slice(0, 175).trim()}…` : rawDesc;
                      return <p className="dash-company-info__desc">{shortDesc}</p>;
                    })()}
                    <div className="dash-company-meta-pills">
                      {(orgProfile?.orgType || user?.orgType) && (
                        <span className="dash-company-meta-pill">
                          <Building2 size={13} color="var(--brand-accent)" /> Type: {orgProfile?.orgType || user?.orgType}
                        </span>
                      )}
                      {(orgProfile?.industry || user?.industry) && (
                        <span className="dash-company-meta-pill">
                          Industry: {orgProfile?.industry || user?.industry}
                        </span>
                      )}
                      {(orgProfile?.size || user?.size) && (
                        <span className="dash-company-meta-pill">
                          Size: {orgProfile?.size || user?.size}
                        </span>
                      )}
                      {(orgProfile?.city || user?.city || orgProfile?.country || user?.country) && (
                        <span className="dash-company-meta-pill">
                          Location:{' '}
                          {[
                            orgProfile?.city || user?.city,
                            orgProfile?.state || user?.state,
                            orgProfile?.country || user?.country,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      )}
                      {(orgProfile?.createdAt || user?.orgCreatedAt) && (
                        <span className="dash-company-meta-pill">
                          Registered: {new Date(orgProfile?.createdAt || user?.orgCreatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 6 Summary Metric Cards */}
              <div className="dash-stats-grid">
                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Total Campaign Managers</span>
                    <div className="dash-stat-card__icon">
                      <UserCheck size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.totalCampaignManagers}</div>
                  <div className="dash-stat-card__meta">Authorised consultation leads</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Total Stakeholders</span>
                    <div className="dash-stat-card__icon">
                      <Users size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.totalStakeholders}</div>
                  <div className="dash-stat-card__meta">
                    {stats.activeStakeholders} active in central directory
                  </div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Total Campaigns</span>
                    <div className="dash-stat-card__icon">
                      <FolderKanban size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.totalCampaigns}</div>
                  <div className="dash-stat-card__meta">{stats.draftCampaigns} in draft preparation</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Active Campaigns</span>
                    <div className="dash-stat-card__icon">
                      <Activity size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.activeCampaigns}</div>
                  <div className="dash-stat-card__meta">Currently collecting feedback</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Completed Campaigns</span>
                    <div className="dash-stat-card__icon">
                      <CheckCircle2 size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.completedCampaigns}</div>
                  <div className="dash-stat-card__meta">Closed &amp; ready for deliberation</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Total Feedback Submissions</span>
                    <div className="dash-stat-card__icon">
                      <FileText size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.totalFeedbackSubmissions}</div>
                  <div className="dash-stat-card__meta">Verified stakeholder responses</div>
                </div>
              </div>

              {/* Recent Institutional Activity Feed (Only Recent Activity on Dashboard) */}
              <div className="dash-panel">
                <div className="dash-panel__title">
                  <span>Recent Institutional Activity</span>
                  <button
                    type="button"
                    className="dash-btn-secondary dash-btn-sm"
                    onClick={fetchStatsAndActivity}
                    title="Refresh Activity"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>

                {activities.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No recent administrative or campaign events logged yet.
                  </div>
                ) : (
                  <div className="dash-activity-list">
                    {activities.slice(0, 8).map(act => (
                      <div key={act.id} className="dash-activity-item">
                        <span className="dash-activity-dot" />
                        <div style={{ flex: 1 }}>
                          <div className="dash-activity-text">{act.description}</div>
                          <div className="dash-activity-meta">
                            {act.actorName ? `By ${act.actorName} · ` : ''}
                            {new Date(act.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 1B: CAMPAIGN MANAGER DASHBOARD
             ══════════════════════════════════════════════════════════ */}
          {portalMode === 'MANAGER' && activeView === 'dashboard' && (
            <div className="animate-fade-in">
              <div className="dash-action-bar">
                <div>
                  <h2 className="dash-title">Campaign Manager Workspace</h2>
                  <p className="dash-subtitle">
                    Design consultation campaigns, select cohorts from the central stakeholder directory, and monitor feedback.
                  </p>
                </div>
                <button
                  type="button"
                  className="dash-btn-primary"
                  onClick={() => {
                    setEditingCampaign(null);
                    setActiveView('create_campaign');
                  }}
                >
                  <Plus size={15} /> Create Consultation Campaign
                </button>
              </div>

              <div className="dash-stats-grid">
                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">My Campaigns</span>
                    <div className="dash-stat-card__icon">
                      <FolderKanban size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.myTotalCampaigns}</div>
                  <div className="dash-stat-card__meta">{stats.myDraftCampaigns} draft(s) in preparation</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Active Consultations</span>
                    <div className="dash-stat-card__icon">
                      <Activity size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.myActiveCampaigns}</div>
                  <div className="dash-stat-card__meta">Open for stakeholder submissions</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Completed Campaigns</span>
                    <div className="dash-stat-card__icon">
                      <CheckCircle2 size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.myCompletedCampaigns}</div>
                  <div className="dash-stat-card__meta">Closed consultations</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Feedback Received</span>
                    <div className="dash-stat-card__icon">
                      <FileText size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.myFeedbackSubmissions}</div>
                  <div className="dash-stat-card__meta">Across your managed campaigns</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-card__top">
                    <span className="dash-stat-card__label">Eligible Directory Pool</span>
                    <div className="dash-stat-card__icon">
                      <Users size={17} />
                    </div>
                  </div>
                  <div className="dash-stat-card__value">{stats.activeStakeholders}</div>
                  <div className="dash-stat-card__meta">Active stakeholders maintained by Admin</div>
                </div>
              </div>

              <div className="dash-panel">
                <div className="dash-panel__title">
                  <span>Recent Consultation Campaigns</span>
                  <button
                    type="button"
                    className="dash-btn-secondary dash-btn-sm"
                    onClick={() => setActiveView('my_campaigns')}
                  >
                    View All My Campaigns
                  </button>
                </div>

                {campaigns.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No campaigns created yet. Click &ldquo;Create Consultation Campaign&rdquo; to launch your first consultation.
                  </div>
                ) : (
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Campaign Title &amp; Code</th>
                          <th>Status</th>
                          <th>Participants</th>
                          <th>Submissions</th>
                          <th>Timeline</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.slice(0, 5).map(c => (
                          <tr key={c.id}>
                            <td>
                              <div style={{ fontWeight: '700' }}>{c.title}</div>
                              <div style={{ fontSize: '0.76rem', fontFamily: 'monospace', color: 'var(--brand-accent)' }}>
                                Code: {c.campaign_code}
                              </div>
                            </td>
                            <td>
                              <span className={`status-pill status-pill--${c.status.toLowerCase()}`}>
                                {c.status}
                              </span>
                            </td>
                            <td>{c.participant_count} stakeholders</td>
                            <td>{c.response_count} responses</td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {new Date(c.opening_date).toLocaleDateString()} – {new Date(c.closing_date).toLocaleDateString()}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                <button
                                  type="button"
                                  className="dash-btn-secondary dash-btn-sm"
                                  onClick={() => openCampaignDetails(c.id)}
                                >
                                  <Users size={13} /> Stakeholders
                                </button>
                                <button
                                  type="button"
                                  className="dash-btn-secondary dash-btn-sm"
                                  onClick={() => openResponsesView(c.id)}
                                >
                                  <Eye size={13} /> Responses
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 2: CAMPAIGN MANAGER MANAGEMENT (ADMIN ONLY)
             ══════════════════════════════════════════════════════════ */}
          {portalMode === 'ADMIN' && activeView === 'managers' && (
            <div className="animate-fade-in">
              <div className="dash-action-bar">
                <div>
                  <h2 className="dash-title">Campaign Manager Management</h2>
                  <p className="dash-subtitle">
                    Create, manage, and govern Campaign Manager accounts across departments.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    onClick={() => setShowBulkManagerCsvModal(true)}
                  >
                    <Upload size={15} /> Bulk Import (CSV / Excel)
                  </button>
                  <button
                    type="button"
                    className="dash-btn-primary"
                    onClick={() => {
                      setInviteManagerErrors({});
                      setShowInviteManagerModal(true);
                    }}
                  >
                    <Plus size={15} /> Add Campaign Manager
                  </button>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="dash-filter-bar">
                <div className="dash-search-box">
                  <Search size={15} />
                  <input
                    type="text"
                    className="dash-search-input"
                    placeholder="Search managers by name, email, or department..."
                    value={managerSearch}
                    onChange={e => setManagerSearch(e.target.value)}
                  />
                </div>

                <select
                  className="dash-filter-select"
                  value={managerDeptFilter}
                  onChange={e => setManagerDeptFilter(e.target.value)}
                >
                  <option value="ALL">All Departments</option>
                  {managerDepartments.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                <select
                  className="dash-filter-select"
                  value={managerStatusFilter}
                  onChange={e => setManagerStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Account Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending_invite">Pending Invitation</option>
                </select>

                <select
                  className="dash-filter-select"
                  value={managerDateFilter}
                  onChange={e => setManagerDateFilter(e.target.value)}
                >
                  <option value="ALL">All Dates</option>
                  <option value="today">Today</option>
                  <option value="last_7">Last 7 Days</option>
                  <option value="last_30">Last 30 Days</option>
                  <option value="this_month">This Month</option>
                  <option value="this_year">This Year</option>
                </select>
              </div>

              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Full Name</th>
                      <th>Contact Number</th>
                      <th>Official Email</th>
                      <th>Department &amp; Designation</th>
                      <th>Account Created</th>
                      <th>Account Status</th>
                      <th>Campaigns Created</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMembers ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                          Loading Campaign Managers...
                        </td>
                      </tr>
                    ) : filteredManagers.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                          No Campaign Managers match the current search or filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredManagers.map(m => (
                        <tr key={m.id || m.email}>
                          <td>
                            <div style={{ fontWeight: '700' }}>
                              {m.first_name} {m.last_name}
                            </div>
                          </td>
                          <td>
                            {m.phone ? (
                              <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>{m.phone}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td>{m.email}</td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{m.department || 'General'}</div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                              {m.designation || 'Campaign Manager'}
                            </div>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                m.status === 'active'
                                  ? 'status-pill--active'
                                  : m.status === 'inactive'
                                  ? 'status-pill--inactive'
                                  : 'status-pill--sent'
                              }`}
                            >
                              {m.status === 'pending_invite' ? 'Pending Activation' : m.status}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: '700' }}>{m.campaigns_created_count || 0}</span> campaigns
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {m.status === 'pending_invite' ? (
                                <>
                                  {m.token && (
                                    <button
                                      type="button"
                                      className="dash-btn-secondary dash-btn-sm"
                                      onClick={() => handleCopyManagerInviteLink(m)}
                                      title="Copy activation link to clipboard"
                                    >
                                      <Copy size={13} /> Copy Link
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className="dash-btn-secondary dash-btn-sm"
                                    onClick={() => handleResendManagerInvite(m)}
                                    title="Resend invitation email"
                                    disabled={resendingInviteEmail === m.email}
                                  >
                                    {resendingInviteEmail === m.email ? (
                                      <>
                                        <RotateCw size={13} className="spin" /> Resending...
                                      </>
                                    ) : (
                                      <>
                                        <Send size={13} /> Resend
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    className="dash-btn-secondary dash-btn-sm"
                                    style={{ color: '#ef4444' }}
                                    onClick={() => handleRevokeManagerInvite(m)}
                                    title="Revoke and cancel invitation"
                                  >
                                    <Trash2 size={13} /> Revoke
                                  </button>
                                </>
                              ) : (
                                m.id && (
                                  <>
                                    <button
                                      type="button"
                                      className="dash-btn-secondary dash-btn-sm"
                                      onClick={() => {
                                        setFilterByManagerId(m.id);
                                        setActiveView('all_campaigns');
                                      }}
                                      title="View campaigns created by this manager"
                                    >
                                      <FolderKanban size={13} /> Campaigns
                                    </button>

                                    <button
                                      type="button"
                                      className="dash-btn-secondary dash-btn-sm"
                                      onClick={() => openEditManager(m)}
                                      title="Edit manager details"
                                    >
                                      <Edit3 size={13} /> Edit
                                    </button>

                                    {m.id !== user?.id && (
                                      <>
                                        <button
                                          type="button"
                                          className="dash-btn-secondary dash-btn-sm"
                                          style={{
                                            color:
                                              m.status === 'inactive'
                                                ? 'var(--sentiment-positive)'
                                                : 'var(--sentiment-negative)',
                                          }}
                                          onClick={() => handleToggleManagerStatus(m)}
                                        >
                                          <Power size={13} />
                                          {m.status === 'inactive' ? 'Activate' : 'Deactivate'}
                                        </button>

                                        {(m.canDelete || (m.campaigns_created_count || 0) === 0) && (
                                          <button
                                            type="button"
                                            className="dash-btn-secondary dash-btn-sm"
                                            style={{ color: '#ef4444' }}
                                            onClick={() => handleDeleteManager(m)}
                                            title="Delete manager"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 3: CENTRAL STAKEHOLDER DIRECTORY (ADMIN ONLY)
             ══════════════════════════════════════════════════════════ */}
          {portalMode === 'ADMIN' && activeView === 'stakeholders' && (
            <div className="animate-fade-in">
              <div className="dash-action-bar">
                <div>
                  <h2 className="dash-title">Central Stakeholder Directory</h2>
                  <p className="dash-subtitle">
                    Maintain institutional stakeholder records. Stakeholders do not need accounts and receive campaign-specific invitation links when selected by Campaign Managers.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    onClick={() => setShowBulkCsvModal(true)}
                  >
                    <Upload size={15} /> Bulk Import (CSV / Excel)
                  </button>
                  <button
                    type="button"
                    className="dash-btn-primary"
                    onClick={openAddStakeholder}
                  >
                    <Plus size={15} /> Add Stakeholder
                  </button>
                </div>
              </div>

              {/* Search & Multi-Filter Bar */}
              <div className="dash-filter-bar">
                <div className="dash-search-box">
                  <Search size={15} />
                  <input
                    type="text"
                    className="dash-search-input"
                    placeholder="Search by name, official/alternate email, or Employee ID..."
                    value={shSearch}
                    onChange={e => setShSearch(e.target.value)}
                  />
                </div>

                <select
                  className="dash-filter-select"
                  value={shDeptFilter}
                  onChange={e => setShDeptFilter(e.target.value)}
                >
                  <option value="ALL">All Departments</option>
                  {shDepartments.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                <select
                  className="dash-filter-select"
                  value={shDesigFilter}
                  onChange={e => setShDesigFilter(e.target.value)}
                >
                  <option value="ALL">All Designations</option>
                  {shDesignations.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                <select
                  className="dash-filter-select"
                  value={shCatFilter}
                  onChange={e => setShCatFilter(e.target.value)}
                >
                  <option value="ALL">All Categories</option>
                  {shCategories.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  className="dash-filter-select"
                  value={shStatusFilter}
                  onChange={e => setShStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="not_registered">Not Registered</option>
                </select>
              </div>

              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Stakeholder Name &amp; ID</th>
                      <th>Official &amp; Alternate Email</th>
                      <th>Department</th>
                      <th>Designation</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMembers ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                          Loading Stakeholder Directory...
                        </td>
                      </tr>
                    ) : filteredStakeholders.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                          No stakeholder records match your search or filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredStakeholders.map(s => (
                        <tr key={s.id}>
                          <td>
                            <div style={{ fontWeight: '700' }}>
                              {s.first_name} {s.last_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {s.employee_id ? `ID: ${s.employee_id}` : ''}
                              {s.employee_id && s.contact ? ' · ' : ''}
                              {s.contact || ''}
                            </div>
                          </td>
                          <td>
                            <div>{s.email}</div>
                            {s.alternate_email && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Alt: {s.alternate_email}
                              </div>
                            )}
                          </td>
                          <td style={{ fontWeight: '600' }}>{s.department || 'General'}</td>
                          <td>{s.designation || 'Member'}</td>
                          <td>
                            <span className="category-badge">{s.category || 'Employee'}</span>
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                s.status === 'active'
                                  ? 'status-pill--active'
                                  : s.status === 'not_registered'
                                  ? 'status-pill--not_registered'
                                  : 'status-pill--inactive'
                              }`}
                            >
                              {s.status === 'not_registered' ? 'Not Registered' : s.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="dash-btn-secondary dash-btn-sm"
                                onClick={() => openEditStakeholder(s)}
                                title="Edit stakeholder details"
                              >
                                <Edit3 size={13} /> Edit
                              </button>

                              {s.status === 'active' ? (
                                <button
                                  type="button"
                                  className="dash-btn-secondary dash-btn-sm"
                                  style={{ color: 'var(--sentiment-negative)' }}
                                  onClick={() => handleToggleStakeholderStatus(s)}
                                  title="Deactivate stakeholder"
                                >
                                  <Power size={13} /> Deactivate
                                </button>
                              ) : s.status === 'inactive' ? (
                                <button
                                  type="button"
                                  className="dash-btn-secondary dash-btn-sm"
                                  style={{ color: 'var(--sentiment-positive)' }}
                                  onClick={() => handleToggleStakeholderStatus(s)}
                                  title="Activate stakeholder"
                                >
                                  <Power size={13} /> Activate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="dash-btn-secondary dash-btn-sm"
                                  disabled
                                  style={{
                                    opacity: 0.45,
                                    cursor: 'not-allowed',
                                    color: 'var(--text-muted)',
                                  }}
                                  title="Disabled: Stakeholder must verify enrollment by clicking the link in their email and typing the organisation code."
                                >
                                  <Power size={13} /> Activate
                                </button>
                              )}

                              {(s.status === 'not_registered' || !s.hasParticipated) && (
                                <button
                                  type="button"
                                  className="dash-btn-secondary dash-btn-sm"
                                  style={{ color: '#ef4444' }}
                                  onClick={() => handleDeleteStakeholder(s)}
                                  title="Delete stakeholder from directory"
                                >
                                  <Trash2 size={13} /> Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 4: ALL CAMPAIGNS (ADMIN) & MY CAMPAIGNS (MANAGER)
             ══════════════════════════════════════════════════════════ */}
          {(activeView === 'all_campaigns' || activeView === 'my_campaigns') && (
            <div className="animate-fade-in">
              <div className="dash-action-bar">
                <div>
                  <h2 className="dash-title">
                    {portalMode === 'ADMIN' ? 'All Organisation Campaigns' : 'My Consultation Campaigns'}
                  </h2>
                  <p className="dash-subtitle">
                    {portalMode === 'ADMIN'
                      ? 'Inspect consultation campaigns across all departments, monitor participation, and audit deleted campaign records.'
                      : 'Manage consultation timelines, review stakeholder invitation statuses, and inspect anonymised feedback.'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  {filterByManagerId && (
                    <button
                      type="button"
                      className="dash-btn-secondary"
                      onClick={() => setFilterByManagerId(null)}
                    >
                      <X size={14} /> Clear Manager Filter
                    </button>
                  )}
                  {portalMode === 'MANAGER' && (
                    <button
                      type="button"
                      className="dash-btn-primary"
                      onClick={() => {
                        setEditingCampaign(null);
                        setActiveView('create_campaign');
                      }}
                    >
                      <Plus size={15} /> Create Campaign
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-tabs: Active Campaigns vs. Deleted Campaign History */}
              <div className="dash-subtabs">
                <button
                  type="button"
                  className={`dash-subtab-btn ${campaignSubTab === 'active' ? 'active' : ''}`}
                  onClick={() => setCampaignSubTab('active')}
                >
                  <FolderKanban size={15} /> Active &amp; Completed Campaigns ({campaigns.length})
                </button>
                <button
                  type="button"
                  className={`dash-subtab-btn ${campaignSubTab === 'deleted' ? 'active' : ''}`}
                  onClick={() => setCampaignSubTab('deleted')}
                >
                  <Archive size={15} /> Deleted Campaign History ({deletedCampaigns.length})
                </button>
              </div>

              {/* Filter Bar */}
              <div className="dash-filter-bar">
                <div className="dash-search-box">
                  <Search size={15} />
                  <input
                    type="text"
                    className="dash-search-input"
                    placeholder="Search campaigns by title, code, or manager..."
                    value={campaignSearch}
                    onChange={e => setCampaignSearch(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select
                    className="dash-filter-select"
                    value={campaignStatusFilter}
                    onChange={e => setCampaignStatusFilter(e.target.value)}
                    title="Filter by campaign status"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="OPEN">Open / Active</option>
                    <option value="CLOSED">Closed / Completed</option>
                  </select>

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: 'var(--bg-secondary)',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>Opened:</span>
                    <input
                      type="date"
                      value={campaignDateFrom}
                      onChange={e => setCampaignDateFrom(e.target.value)}
                      title="From Date"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '0.78rem',
                        fontFamily: 'inherit',
                      }}
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>to</span>
                    <input
                      type="date"
                      value={campaignDateTo}
                      onChange={e => setCampaignDateTo(e.target.value)}
                      title="To Date"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '0.78rem',
                        fontFamily: 'inherit',
                      }}
                    />
                    {(campaignDateFrom || campaignDateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCampaignDateFrom('');
                          setCampaignDateTo('');
                        }}
                        title="Clear date filter"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          padding: '0.1rem',
                          display: 'inline-flex',
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {loadingCampaigns ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Loading consultation campaigns...
                </div>
              ) : displayedCampaigns.length === 0 ? (
                <div className="dash-panel" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
                  <FileText size={38} style={{ opacity: 0.35, margin: '0 auto 0.75rem' }} />
                  <h3 style={{ marginBottom: '0.35rem' }}>
                    {campaignSubTab === 'deleted' ? 'No Deleted Campaigns' : 'No Campaigns Found'}
                  </h3>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
                    {campaignSubTab === 'deleted'
                      ? 'Deleted consultation campaigns and their governance audit trail will appear here.'
                      : 'No consultation campaigns match your current filter selection.'}
                  </p>
                </div>
              ) : campaignSubTab === 'deleted' ? (
                /* ── Deleted Campaign History Table ── */
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Campaign Title &amp; Code</th>
                        <th>Created By</th>
                        <th>Prior Status</th>
                        <th>Deleted By</th>
                        <th>Deletion Date</th>
                        <th>Reason for Deletion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedCampaigns.map(dc => (
                        <tr key={dc.id}>
                          <td>
                            <div style={{ fontWeight: '700' }}>{dc.title}</div>
                            <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                              Code: {dc.campaign_code}
                            </div>
                          </td>
                          <td>
                            {dc.creator_first_name} {dc.creator_last_name}
                          </td>
                          <td>
                            <span className="status-pill status-pill--deleted">{dc.status}</span>
                          </td>
                          <td>
                            {dc.deleter_first_name
                              ? `${dc.deleter_first_name} ${dc.deleter_last_name}`
                              : 'Administrator'}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {dc.deleted_at ? new Date(dc.deleted_at).toLocaleString() : '—'}
                          </td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            {dc.deletion_reason || 'Administrative removal'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* ── Active / Completed / Draft Campaigns Table ── */
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Campaign Title &amp; Code</th>
                        <th>Campaign Manager</th>
                        <th>Status</th>
                        <th>Assigned Stakeholders</th>
                        {portalMode === 'MANAGER' && <th>Feedback</th>}
                        <th>Consultation Window</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedCampaigns.map(c => {
                        const isOwner = c.created_by === user?.id;
                        const hasResponses = Number(c.response_count) > 0;
                        const isClosed = c.status === 'CLOSED';
                        const managerCannotDelete = !isAdmin && (hasResponses || isClosed);

                        return (
                          <tr key={c.id}>
                            <td>
                              <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>{c.title}</div>
                              <div
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.76rem',
                                  color: 'var(--brand-accent)',
                                  marginTop: '0.15rem',
                                }}
                              >
                                Code: {c.campaign_code}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: '600' }}>
                                {c.creator_first_name} {c.creator_last_name}
                              </div>
                            </td>
                            <td>
                              <span className={`status-pill status-pill--${c.status.toLowerCase()}`}>
                                {c.status}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="dash-btn-secondary dash-btn-sm"
                                onClick={() => openCampaignDetails(c.id)}
                                title={
                                  portalMode === 'ADMIN'
                                    ? 'View assigned stakeholders & aggregate participation metrics'
                                    : 'Inspect assigned stakeholders & invitation status'
                                }
                              >
                                <Users size={13} /> {c.participant_count} Stakeholders
                              </button>
                            </td>
                            {portalMode === 'MANAGER' && (
                              <td>
                                <button
                                  type="button"
                                  className="dash-btn-secondary dash-btn-sm"
                                  onClick={() => openResponsesView(c.id)}
                                >
                                  <Eye size={13} /> {c.response_count} Responses
                                </button>
                              </td>
                            )}
                            <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {portalMode === 'ADMIN' ? (
                                <>
                                  <div>Opened: {new Date(c.opening_date).toLocaleDateString()}</div>
                                  {c.status === 'CLOSED' && (
                                    <div>Closed: {new Date(c.closing_date).toLocaleDateString()}</div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div>Opens: {new Date(c.opening_date).toLocaleDateString()}</div>
                                  <div>Closes: {new Date(c.closing_date).toLocaleDateString()}</div>
                                </>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                {isManager && isOwner && c.status === 'DRAFT' && (
                                  <>
                                    <button
                                      type="button"
                                      className="dash-btn-secondary dash-btn-sm"
                                      onClick={() => openParticipantsPicker(c)}
                                      title="Select Stakeholders from Directory"
                                    >
                                      Assign Cohort
                                    </button>
                                    <button
                                      type="button"
                                      className="dash-btn-secondary dash-btn-sm"
                                      onClick={() => openEditCampaign(c)}
                                      title="Edit Draft"
                                    >
                                      <Edit3 size={13} /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="dash-btn-primary dash-btn-sm"
                                      onClick={() => handleOpenCampaign(c.id)}
                                      title="Launch campaign and dispatch stakeholder invites"
                                    >
                                      <Send size={12} /> Launch
                                    </button>
                                  </>
                                )}

                                {isManager && isOwner && c.status === 'OPEN' && (
                                  <>
                                    <button
                                      type="button"
                                      className="dash-btn-secondary dash-btn-sm"
                                      onClick={() => openEditCampaign(c)}
                                    >
                                      Extend Date
                                    </button>
                                    <button
                                      type="button"
                                      className="dash-btn-primary dash-btn-sm"
                                      onClick={() => handleCloseCampaign(c.id)}
                                    >
                                      Complete
                                    </button>
                                  </>
                                )}

                                {(isAdmin || (isManager && isOwner)) && (
                                  <button
                                    type="button"
                                    className="dash-btn-secondary dash-btn-sm"
                                    disabled={managerCannotDelete}
                                    onClick={() => openDeleteCampaignModal(c)}
                                    title={
                                      managerCannotDelete
                                        ? 'Requires Administrator approval to delete campaigns with responses'
                                        : 'Delete Campaign'
                                    }
                                    style={{
                                      color: managerCannotDelete
                                        ? 'var(--text-muted)'
                                        : 'var(--sentiment-negative)',
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 5: CREATE / EDIT CAMPAIGN WIZARD
             ══════════════════════════════════════════════════════════ */}
          {activeView === 'create_campaign' && (
            <div className="animate-fade-in">
              <CampaignWizard
                initialData={editingCampaign}
                stakeholders={stakeholders}
                onSaveDraft={handleSaveCampaignDraft}
                onPublish={handlePublishCampaign}
                onCancel={() => {
                  setEditingCampaign(null);
                  setActiveView(portalMode === 'ADMIN' ? 'all_campaigns' : 'my_campaigns');
                }}
                saving={savingCampaign}
                orgName={user?.orgName || 'PotentPolicy Institute'}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 6: ORGANISATION PROFILE & PERSONAL ACCOUNT DETAILS
             ══════════════════════════════════════════════════════════ */}
          {activeView === 'profile' && (
            <div className="animate-fade-in">
              <div className="dash-action-bar">
                <div>
                  <h2 className="dash-title">
                    Organisation Profile Management
                  </h2>
                  <p className="dash-subtitle">
                    View and update your organisation profile, contact channels, location, scale, and department configuration.
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="dash-panel" style={{ marginBottom: '1.35rem' }}>
                  <div className="dash-panel__title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span>Organisation Profile Management</span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                        Org ID: #{orgProfile?.id || user?.organisationId} · Registered:{' '}
                        {orgProfile?.createdAt
                          ? new Date(orgProfile.createdAt).toLocaleDateString()
                          : 'Active'}
                      </span>
                    </div>
                    {!isEditingOrg && (
                      <button
                        type="button"
                        className="dash-btn-secondary dash-btn-sm"
                        onClick={() => setIsEditingOrg(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Edit3 size={13} /> Edit Organisation Profile
                      </button>
                    )}
                  </div>

                  {/* Protected Governance Metadata Bar */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '0.75rem',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '0.85rem 1rem',
                      marginBottom: '1.35rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Organisation ID (Protected)
                      </div>
                      <div style={{ fontWeight: '700', marginTop: '0.2rem' }}>
                        ORG-{String(orgProfile?.id || user?.organisationId || 1).padStart(4, '0')}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Confidential Org Code
                      </div>
                      <div style={{ marginTop: '0.2rem' }}>
                        <span className="dash-header__org-code" onClick={handleCopyOrgCode}>
                          {orgProfile?.orgCode || user?.orgCode}
                          {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Registration Date (Protected)
                      </div>
                      <div style={{ fontWeight: '700', marginTop: '0.2rem' }}>
                        {orgProfile?.createdAt
                          ? new Date(orgProfile.createdAt).toLocaleDateString()
                          : 'Verified'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Account Ownership (Protected)
                      </div>
                      <div style={{ fontWeight: '700', marginTop: '0.2rem', color: 'var(--brand-accent)' }}>
                        {user?.firstName} {user?.lastName} (ADMIN)
                      </div>
                    </div>
                  </div>

                  {!isEditingOrg ? (
                    <div className="dash-profile-display-view">
                      <div className="dash-form-section-title">1. Basic Identity &amp; Logo</div>
                      <div className="dash-profile-display-grid">
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Organisation Name</span>
                          <span className="dash-profile-display-value">{orgProfile?.name || user?.orgName || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Display Name</span>
                          <span className="dash-profile-display-value">{orgProfile?.displayName || user?.displayName || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Organisation Type</span>
                          <span className="dash-profile-display-value">{orgProfile?.orgType || user?.orgType || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Industry / Sector</span>
                          <span className="dash-profile-display-value">{orgProfile?.industry || user?.industry || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Official Website</span>
                          <span className="dash-profile-display-value">
                            {orgProfile?.website ? (
                              <a
                                href={orgProfile.website.startsWith('http') ? orgProfile.website : `https://${orgProfile.website}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--brand-accent)', textDecoration: 'underline' }}
                              >
                                {orgProfile.website}
                              </a>
                            ) : (
                              '—'
                            )}
                          </span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Year Established</span>
                          <span className="dash-profile-display-value">{orgProfile?.yearEstablished || user?.yearEstablished || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Organisation Logo</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.2rem' }}>
                            <div className="dash-company-logo" style={{ width: '42px', height: '42px', fontSize: '1rem', borderRadius: '8px' }}>
                              {orgProfile?.logoUrl || user?.logoUrl ? (
                                <img src={orgProfile?.logoUrl || user?.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                getOrgMonogram(orgProfile?.name || user?.orgName)
                              )}
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {orgProfile?.logoUrl || user?.logoUrl ? 'Custom Logo Uploaded' : 'System-generated Monogram'}
                            </span>
                          </div>
                        </div>
                        <div className="dash-profile-display-item" style={{ gridColumn: '1 / -1' }}>
                          <span className="dash-profile-display-label">Organisation Description</span>
                          <span className="dash-profile-display-value">{orgProfile?.description || user?.description || '—'}</span>
                        </div>
                      </div>

                      <div className="dash-form-section-title">2. Location, Contact &amp; Domain</div>
                      <div className="dash-profile-display-grid">
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Country</span>
                          <span className="dash-profile-display-value">{orgProfile?.country || user?.country || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">State / Province</span>
                          <span className="dash-profile-display-value">{orgProfile?.state || user?.state || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">City</span>
                          <span className="dash-profile-display-value">{orgProfile?.city || user?.city || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Postal Code</span>
                          <span className="dash-profile-display-value">{orgProfile?.postalCode || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item" style={{ gridColumn: 'span 2' }}>
                          <span className="dash-profile-display-label">Registered Office Address</span>
                          <span className="dash-profile-display-value">{orgProfile?.registeredAddress || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Organisation Domain</span>
                          <span className="dash-profile-display-value">{orgProfile?.domain || user?.domain || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Official Contact Email</span>
                          <span className="dash-profile-display-value">{orgProfile?.contactEmail || user?.email || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Official Contact Number</span>
                          <span className="dash-profile-display-value">{orgProfile?.contactNumber || user?.phone || '—'}</span>
                        </div>
                      </div>

                      <div className="dash-form-section-title">3. Size, Structure &amp; Department Information</div>
                      <div className="dash-profile-display-grid">
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Organisation Size</span>
                          <span className="dash-profile-display-value">{orgProfile?.size || user?.size || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Estimated Scale / Employees</span>
                          <span className="dash-profile-display-value">{orgProfile?.employeeCount || '—'}</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Department Count</span>
                          <span className="dash-profile-display-value">{orgProfile?.departmentCount || 12} Departments</span>
                        </div>
                        <div className="dash-profile-display-item">
                          <span className="dash-profile-display-label">Governance Structure</span>
                          <span className="dash-profile-display-value">{orgProfile?.organisationStructure || 'Centralised Governance'}</span>
                        </div>
                        <div className="dash-profile-display-item" style={{ gridColumn: '1 / -1' }}>
                          <span className="dash-profile-display-label">Configured Primary Departments</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.4rem' }}>
                            {(orgForm.primaryDepartments && orgForm.primaryDepartments.length > 0
                              ? orgForm.primaryDepartments
                              : ['Policy & Strategy', 'Human Resources', 'School of Engineering', 'Finance & Procurement', 'Student Affairs', 'Legal & Compliance']
                            ).map(dept => (
                              <span key={dept} className="dash-company-meta-pill" style={{ background: 'var(--bg-secondary)' }}>
                                {dept}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveOrgProfile}>
                    <div className="dash-form-section-title">1. Basic Identity &amp; Logo</div>
                    <div className="dash-form-grid" style={{ marginBottom: '0.9rem' }}>
                      <div>
                        <label className="dash-label">Organisation Name *</label>
                        <input
                          type="text"
                          required
                          className="dash-input"
                          value={orgForm.name}
                          onChange={e => setOrgForm(p => ({ ...p, name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Display Name</label>
                        <input
                          type="text"
                          className="dash-input"
                          placeholder="Short display name..."
                          value={orgForm.displayName}
                          onChange={e => setOrgForm(p => ({ ...p, displayName: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Organisation Type *</label>
                        <select
                          className="dash-select"
                          value={orgForm.orgType}
                          onChange={e => setOrgForm(p => ({ ...p, orgType: e.target.value }))}
                        >
                          <option value="Private Company">Private Company</option>
                          <option value="Educational Institution">Educational Institution</option>
                          <option value="Hospital / Clinic">Hospital / Clinic</option>
                          <option value="Bank / Financial Organisation">Bank / Financial Organisation</option>
                          <option value="Non-Governmental Organisation (NGO)">Non-Governmental Organisation (NGO)</option>
                          <option value="Professional Association">Professional Association</option>
                          <option value="Membership Organisation">Membership Organisation</option>
                          <option value="Retail / Service Organisation">Retail / Service Organisation</option>
                          <option value="Other (Private Institution)">Other (Private Institution)</option>
                        </select>
                      </div>
                      <div>
                        <label className="dash-label">Industry / Sector *</label>
                        <select
                          className="dash-select"
                          value={orgForm.industry}
                          onChange={e => setOrgForm(p => ({ ...p, industry: e.target.value }))}
                        >
                          <option value="Information Technology">Information Technology</option>
                          <option value="Education">Education</option>
                          <option value="Healthcare">Healthcare</option>
                          <option value="Finance and Banking">Finance and Banking</option>
                          <option value="Manufacturing">Manufacturing</option>
                          <option value="Retail">Retail</option>
                          <option value="Consulting">Consulting</option>
                          <option value="Telecommunications">Telecommunications</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="dash-label">Official Website</label>
                        <input
                          type="url"
                          className="dash-input"
                          placeholder="https://example.org"
                          value={orgForm.website}
                          onChange={e => setOrgForm(p => ({ ...p, website: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Year Established</label>
                        <input
                          type="number"
                          className="dash-input"
                          placeholder="e.g. 1998"
                          value={orgForm.yearEstablished}
                          onChange={e => setOrgForm(p => ({ ...p, yearEstablished: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="dash-form-grid" style={{ marginBottom: '1rem' }}>
                      <div>
                        <label className="dash-label">Organisation Logo</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.25rem' }}>
                          <div
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '10px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              fontWeight: '800',
                              color: 'var(--brand-accent)',
                            }}
                          >
                            {orgForm.logoUrl ? (
                              <img src={orgForm.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              getOrgMonogram(orgForm.name)
                            )}
                          </div>
                          <label className="dash-btn-secondary dash-btn-sm" style={{ cursor: 'pointer' }}>
                            <Upload size={13} /> Upload New Logo
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleOrgLogoUpload}
                              style={{ display: 'none' }}
                            />
                          </label>
                          {orgForm.logoUrl && (
                            <button
                              type="button"
                              className="dash-btn-secondary dash-btn-sm"
                              style={{ color: 'var(--sentiment-negative)' }}
                              onClick={() => setOrgForm(p => ({ ...p, logoUrl: '' }))}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="dash-label">Organisation Description</label>
                        <textarea
                          rows={2}
                          className="dash-textarea"
                          value={orgForm.description}
                          onChange={e => setOrgForm(p => ({ ...p, description: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="dash-form-section-title">2. Location, Contact &amp; Domain</div>
                    <div className="dash-form-grid" style={{ marginBottom: '1rem' }}>
                      <LocationFields
                        country={orgForm.country}
                        state={orgForm.state}
                        city={orgForm.city}
                        postalCode={orgForm.postalCode}
                        onChange={(field, val) => setOrgForm(p => ({ ...p, [field]: val }))}
                        variant="dashboard"
                      />
                      <div>
                        <label className="dash-label">Postal Code</label>
                        <input
                          type="text"
                          className="dash-input"
                          value={orgForm.postalCode}
                          onChange={e => setOrgForm(p => ({ ...p, postalCode: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Registered Office Address</label>
                        <input
                          type="text"
                          className="dash-input"
                          value={orgForm.registeredAddress}
                          onChange={e => setOrgForm(p => ({ ...p, registeredAddress: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Organisation Domain *</label>
                        <input
                          type="text"
                          required
                          className="dash-input"
                          placeholder="e.g. company.com"
                          value={orgForm.domain}
                          onChange={e => setOrgForm(p => ({ ...p, domain: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Official Contact Email *</label>
                        <input
                          type="email"
                          required
                          className="dash-input"
                          value={orgForm.contactEmail}
                          onChange={e => setOrgForm(p => ({ ...p, contactEmail: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Official Contact Number</label>
                        <input
                          type="tel"
                          className="dash-input"
                          value={orgForm.contactNumber}
                          onChange={e => setOrgForm(p => ({ ...p, contactNumber: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="dash-form-section-title">3. Size, Structure &amp; Department Information</div>
                    <div className="dash-form-grid" style={{ marginBottom: '1rem' }}>
                      <div>
                        <label className="dash-label">Organisation Size Category *</label>
                        <select
                          className="dash-select"
                          value={orgForm.size}
                          onChange={e => setOrgForm(p => ({ ...p, size: e.target.value }))}
                        >
                          <option value="Micro (1–10 employees)">Micro: 1–10 employees</option>
                          <option value="Small (11–50 employees)">Small: 11–50 employees</option>
                          <option value="Medium (51–250 employees)">Medium: 51–250 employees</option>
                          <option value="Large (251–1000 employees)">Large: 251–1000 employees</option>
                          <option value="Enterprise (1000+ employees)">Enterprise: More than 1000 employees</option>
                        </select>
                      </div>
                      <div>
                        <label className="dash-label">Approximate Employee / Member Count *</label>
                        <input
                          type="number"
                          min="1"
                          required
                          className="dash-input"
                          value={orgForm.employeeCount}
                          onChange={e => setOrgForm(p => ({ ...p, employeeCount: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Number of Departments *</label>
                        <input
                          type="number"
                          min="1"
                          required
                          className="dash-input"
                          value={orgForm.departmentCount}
                          onChange={e => setOrgForm(p => ({ ...p, departmentCount: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Number of Branches / Locations</label>
                        <input
                          type="number"
                          min="1"
                          className="dash-input"
                          value={orgForm.branchCount}
                          onChange={e => setOrgForm(p => ({ ...p, branchCount: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Organisation Structure</label>
                        <select
                          className="dash-select"
                          value={orgForm.organisationStructure}
                          onChange={e => setOrgForm(p => ({ ...p, organisationStructure: e.target.value }))}
                        >
                          <option value="Centralised">Centralised</option>
                          <option value="Decentralised">Decentralised</option>
                          <option value="Hybrid">Hybrid</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <label className="dash-label">Primary Departments</label>
                      <div className="dash-cohort-chips" style={{ marginTop: '0.35rem' }}>
                        {orgForm.primaryDepartments.map(dept => (
                          <span
                            key={dept}
                            className="dash-cohort-chip"
                            style={{ background: '#23272A', color: '#fff', borderColor: '#23272A' }}
                            onClick={() =>
                              setOrgForm(p => ({
                                ...p,
                                primaryDepartments: p.primaryDepartments.filter(d => d !== dept),
                              }))
                            }
                          >
                            {dept} <X size={11} />
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '420px', marginTop: '0.45rem' }}>
                        <input
                          type="text"
                          className="dash-input"
                          placeholder="Add a primary department..."
                          value={customOrgDept}
                          onChange={e => setCustomOrgDept(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = customOrgDept.trim();
                              if (val && !orgForm.primaryDepartments.includes(val)) {
                                setOrgForm(p => ({ ...p, primaryDepartments: [...p.primaryDepartments, val] }));
                              }
                              setCustomOrgDept('');
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="dash-btn-secondary dash-btn-sm"
                          onClick={() => {
                            const val = customOrgDept.trim();
                            if (val && !orgForm.primaryDepartments.includes(val)) {
                              setOrgForm(p => ({ ...p, primaryDepartments: [...p.primaryDepartments, val] }));
                            }
                            setCustomOrgDept('');
                          }}
                        >
                          <Plus size={13} /> Add
                        </button>
                      </div>
                    </div>

                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button type="submit" className="dash-btn-primary" disabled={savingOrgProfile}>
                          {savingOrgProfile ? 'Saving Organisation Profile...' : 'Save Organisation Profile'}
                        </button>
                        <button
                          type="button"
                          className="dash-btn-secondary"
                          onClick={() => {
                            if (orgProfile) {
                              setOrgForm(p => ({
                                ...p,
                                name: orgProfile.name || '',
                                displayName: orgProfile.displayName || '',
                                orgType: orgProfile.orgType || '',
                                industry: orgProfile.industry || '',
                                website: orgProfile.website || '',
                                logoUrl: orgProfile.logoUrl || '',
                                description: orgProfile.description || '',
                                yearEstablished: orgProfile.yearEstablished || '',
                                domain: orgProfile.domain || '',
                                country: orgProfile.country || '',
                                state: orgProfile.state || '',
                                city: orgProfile.city || '',
                                registeredAddress: orgProfile.registeredAddress || '',
                                postalCode: orgProfile.postalCode || '',
                                contactEmail: orgProfile.contactEmail || '',
                                contactNumber: orgProfile.contactNumber || '',
                                size: orgProfile.size || '',
                                employeeCount: orgProfile.employeeCount || '',
                                departmentCount: orgProfile.departmentCount || '',
                                primaryDepartments: orgProfile.primaryDepartments || [],
                              }));
                            }
                            setIsEditingOrg(false);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Note: Institutional Workspace Information removed per specification */}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 7: PERSONAL PROFILE (SEPARATE TAB)
             ══════════════════════════════════════════════════════════ */}
          {activeView === 'personal_profile' && (
            <div className="animate-fade-in">
              <div className="dash-action-bar">
                <div>
                  <h2 className="dash-title">Personal Profile</h2>
                  <p className="dash-subtitle">
                    Manage your personal account details, designation, contact channels, and credentials.
                  </p>
                </div>
              </div>

              <div className="dash-panel" style={{ maxWidth: '880px' }}>
                <div className="dash-panel__title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span>Personal Account Details</span>
                  {!isEditingPersonal && (
                    <button
                      type="button"
                      className="dash-btn-secondary dash-btn-sm"
                      onClick={() => setIsEditingPersonal(true)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Edit3 size={13} /> Edit Personal Details
                    </button>
                  )}
                </div>

                {!isEditingPersonal ? (
                  <div className="dash-profile-display-view">
                    <div className="dash-profile-display-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      <div className="dash-profile-display-item">
                        <span className="dash-profile-display-label">Full Name</span>
                        <span className="dash-profile-display-value">{user?.firstName} {user?.lastName}</span>
                      </div>
                      <div className="dash-profile-display-item">
                        <span className="dash-profile-display-label">Official Email</span>
                        <span className="dash-profile-display-value">{user?.email}</span>
                      </div>
                      <div className="dash-profile-display-item">
                        <span className="dash-profile-display-label">Department</span>
                        <span className="dash-profile-display-value">{user?.department || 'Administration'}</span>
                      </div>
                      <div className="dash-profile-display-item">
                        <span className="dash-profile-display-label">Designation</span>
                        <span className="dash-profile-display-value">{user?.designation || (isAdmin ? 'System Administrator' : 'Campaign Manager')}</span>
                      </div>
                      <div className="dash-profile-display-item">
                        <span className="dash-profile-display-label">Contact Phone</span>
                        <span className="dash-profile-display-value">{user?.phone || '—'}</span>
                      </div>
                      <div className="dash-profile-display-item">
                        <span className="dash-profile-display-label">Account Role</span>
                        <span className="dash-profile-display-value" style={{ color: 'var(--brand-accent)' }}>
                          {isAdmin ? 'Organisation Administrator' : 'Campaign Manager'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveProfile}>
                    <div className="dash-form-grid" style={{ marginBottom: '0.9rem' }}>
                      <div>
                        <label className="dash-label">First Name *</label>
                        <input
                          type="text"
                          required
                          className="dash-input"
                          value={profileForm.firstName}
                          onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Last Name *</label>
                        <input
                          type="text"
                          required
                          className="dash-input"
                          value={profileForm.lastName}
                          onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '0.9rem' }}>
                      <label className="dash-label">Official Email Address (Verified)</label>
                      <input
                        type="email"
                        disabled
                        className="dash-input"
                        value={user?.email || ''}
                        style={{ opacity: 0.7, cursor: 'not-allowed' }}
                      />
                    </div>

                    <div className="dash-form-grid" style={{ marginBottom: '0.9rem' }}>
                      <div>
                        <label className="dash-label">Department</label>
                        <input
                          type="text"
                          className="dash-input"
                          value={profileForm.department}
                          onChange={e => setProfileForm(p => ({ ...p, department: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="dash-label">Designation</label>
                        <input
                          type="text"
                          className="dash-input"
                          value={profileForm.designation}
                          onChange={e => setProfileForm(p => ({ ...p, designation: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <label className="dash-label">Contact Phone</label>
                      <input
                        type="tel"
                        className="dash-input"
                        value={profileForm.phone}
                        onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button type="submit" className="dash-btn-primary" disabled={savingProfile}>
                        {savingProfile ? 'Saving...' : 'Update Personal Profile'}
                      </button>
                      <button
                        type="button"
                        className="dash-btn-secondary"
                        onClick={() => {
                          if (user) {
                            setProfileForm({
                              firstName: user.firstName || '',
                              lastName: user.lastName || '',
                              department: user.department || '',
                              designation: user.designation || '',
                              phone: user.phone || '',
                            });
                          }
                          setIsEditingPersonal(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 1: ADD / INVITE CAMPAIGN MANAGER
         ══════════════════════════════════════════════════════════════ */}
      {showInviteManagerModal && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal animate-fade-in" style={{ maxWidth: '520px' }}>
            <div className="dash-modal-header">
              <div>
                <h3 className="dash-modal-title">Add Campaign Manager</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Role is strictly assigned as <strong>Campaign Manager</strong>. An activation invitation will be sent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteManagerModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleInviteManager}>
              <div style={{ marginBottom: '0.9rem' }}>
                <label className="dash-label">Full Name *</label>
                <input
                  type="text"
                  required
                  className="dash-input"
                  placeholder="Enter full name"
                  value={inviteManagerForm.fullName}
                  onChange={e => {
                    setInviteManagerForm(p => ({ ...p, fullName: e.target.value }));
                    if (inviteManagerErrors.fullName) setInviteManagerErrors(p => ({ ...p, fullName: '' }));
                  }}
                />
                {inviteManagerErrors.fullName && (
                  <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    {inviteManagerErrors.fullName}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: '0.9rem' }}>
                <label className="dash-label">Official Email Address *</label>
                <input
                  type="email"
                  required
                  className="dash-input"
                  placeholder="user@domain.in"
                  value={inviteManagerForm.email}
                  onChange={e => {
                    setInviteManagerForm(p => ({ ...p, email: e.target.value }));
                    if (inviteManagerErrors.email) setInviteManagerErrors(p => ({ ...p, email: '' }));
                  }}
                />
                {inviteManagerErrors.email && (
                  <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    {inviteManagerErrors.email}
                  </span>
                )}
              </div>

              <div className="dash-form-grid" style={{ marginBottom: '0.9rem' }}>
                <div>
                  <label className="dash-label">Department *</label>
                  <input
                    type="text"
                    required
                    className="dash-input"
                    placeholder="Enter department"
                    value={inviteManagerForm.department}
                    onChange={e => {
                      setInviteManagerForm(p => ({ ...p, department: e.target.value }));
                      if (inviteManagerErrors.department) setInviteManagerErrors(p => ({ ...p, department: '' }));
                    }}
                  />
                  {inviteManagerErrors.department && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {inviteManagerErrors.department}
                    </span>
                  )}
                </div>
                <div>
                  <label className="dash-label">Designation *</label>
                  <input
                    type="text"
                    required
                    className="dash-input"
                    placeholder="Enter designation"
                    value={inviteManagerForm.designation}
                    onChange={e => {
                      setInviteManagerForm(p => ({ ...p, designation: e.target.value }));
                      if (inviteManagerErrors.designation) setInviteManagerErrors(p => ({ ...p, designation: '' }));
                    }}
                  />
                  {inviteManagerErrors.designation && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {inviteManagerErrors.designation}
                    </span>
                  )}
                </div>
              </div>

              <div className="dash-form-grid" style={{ marginBottom: '1.1rem' }}>
                <div>
                  <label className="dash-label">Contact Number * (10 Digits)</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    className="dash-input"
                    placeholder="Enter 10-digit phone number"
                    value={inviteManagerForm.phone}
                    onChange={e => {
                      setInviteManagerForm(p => ({ ...p, phone: e.target.value }));
                      if (inviteManagerErrors.phone) setInviteManagerErrors(p => ({ ...p, phone: '' }));
                    }}
                  />
                  {inviteManagerErrors.phone && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {inviteManagerErrors.phone}
                    </span>
                  )}
                </div>
                <div>
                  <label className="dash-label">Assigned System Role</label>
                  <input
                    type="text"
                    disabled
                    className="dash-input"
                    value="Campaign Manager"
                    style={{ opacity: 0.75, fontWeight: '700' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => setShowInviteManagerModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="dash-btn-primary" disabled={invitingManager}>
                  {invitingManager ? (
                    <>
                      <RotateCw size={14} className="spin" /> Sending Invitation...
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Send Manager Activation Invite
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 1B: CSV & EXCEL BULK IMPORT FOR CAMPAIGN MANAGERS
         ══════════════════════════════════════════════════════════════ */}
      {showBulkManagerCsvModal && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal dash-modal--wide animate-fade-in">
            <div className="dash-modal-header">
              <div>
                <h3 className="dash-modal-title">Bulk Import Campaign Managers</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Upload an Excel (<code>.xlsx</code> / <code>.xls</code>) or <code>.csv</code> spreadsheet, or paste rows below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkManagerCsvModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.65rem' }}>
              <label className="dash-btn-primary dash-btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> Choose Excel / CSV File
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                  onChange={handleManagerCsvFileUpload}
                  style={{ display: 'none' }}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="dash-btn-secondary dash-btn-sm"
                  onClick={handleDownloadSampleManagerExcel}
                >
                  <Download size={13} /> Sample Excel (.xlsx)
                </button>
                <button
                  type="button"
                  className="dash-btn-secondary dash-btn-sm"
                  onClick={handleDownloadSampleManagerCsv}
                >
                  <Download size={13} /> Sample CSV
                </button>
              </div>
            </div>

            {managerUploadedFileName && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                marginBottom: '1rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                color: 'var(--sentiment-positive, #15803d)',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}>
                <CheckCircle2 size={14} />
                <span>Loaded File: <strong>{managerUploadedFileName}</strong> ({managerCsvPreviewRows.filter(r => r.isValid).length} valid of {managerCsvPreviewRows.length} rows ready)</span>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="dash-label" style={{ marginBottom: 0, fontWeight: 600, fontSize: '0.82rem' }}>
                  Or paste rows directly:
                </label>
                <button
                  type="button"
                  onClick={() => handleManagerCsvTextChange(SAMPLE_MANAGER_CSV_CONTENT)}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-accent)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Fill sample rows
                </button>
              </div>
              <textarea
                rows={3}
                className="dash-textarea"
                style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
                placeholder="Paste spreadsheet rows or CSV data here..."
                value={managerCsvRawText}
                onChange={e => handleManagerCsvTextChange(e.target.value)}
              />
            </div>

            {managerCsvPreviewRows.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '700' }}>
                    Preview Parsed Managers ({managerCsvPreviewRows.filter(r => r.isValid).length} of {managerCsvPreviewRows.length} valid)
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    All fields mandatory &bull; Contact must be 10 digits
                  </span>
                </div>
                <div className="dash-table-wrap" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Full Name</th>
                        <th>Official Email</th>
                        <th>Department</th>
                        <th>Designation</th>
                        <th>Contact Number</th>
                        <th>Validation Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managerCsvPreviewRows.map((r, i) => (
                        <tr key={i} style={{ background: r.isValid ? 'transparent' : 'rgba(239, 68, 68, 0.05)' }}>
                          <td style={{ fontWeight: '600' }}>{r.fullName || <span style={{ color: '#ef4444' }}>Missing</span>}</td>
                          <td>{r.email || <span style={{ color: '#ef4444' }}>Missing</span>}</td>
                          <td>{r.department || <span style={{ color: '#ef4444' }}>Missing</span>}</td>
                          <td>{r.designation || <span style={{ color: '#ef4444' }}>Missing</span>}</td>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: r.isValid ? 'inherit' : '#ef4444' }}>
                              {r.phone || r.contactRaw || 'Missing'}
                            </span>
                          </td>
                          <td>
                            {r.isValid ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                color: '#16a34a',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: 'rgba(34, 197, 94, 0.1)',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '6px'
                              }}>
                                <Check size={11} /> Ready
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                color: '#ef4444',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: 'rgba(239, 68, 68, 0.1)',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '6px'
                              }}>
                                <AlertCircle size={11} /> {r.validationError}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => setShowBulkManagerCsvModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dash-btn-primary"
                disabled={managerCsvPreviewRows.filter(r => r.isValid).length === 0 || importingManagerCsv}
                onClick={handleConfirmManagerCsvImport}
              >
                {importingManagerCsv ? (
                  <>
                    <RotateCw size={14} className="spin" /> Importing &amp; Dispatching Invites...
                  </>
                ) : (
                  `Import & Invite ${managerCsvPreviewRows.filter(r => r.isValid).length} Manager(s)`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 2: EDIT CAMPAIGN MANAGER DETAILS
         ══════════════════════════════════════════════════════════════ */}
      {showEditManagerModal && editingManager && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal animate-fade-in" style={{ maxWidth: '500px' }}>
            <div className="dash-modal-header">
              <h3 className="dash-modal-title">Edit Campaign Manager</h3>
              <button
                type="button"
                onClick={() => setShowEditManagerModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditManager}>
              <div style={{ marginBottom: '0.9rem' }}>
                <label className="dash-label">Full Name *</label>
                <input
                  type="text"
                  required
                  className="dash-input"
                  value={editManagerForm.fullName}
                  onChange={e => setEditManagerForm(p => ({ ...p, fullName: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: '0.9rem' }}>
                <label className="dash-label">Official Email Address *</label>
                <input
                  type="email"
                  required
                  className="dash-input"
                  value={editManagerForm.email}
                  onChange={e => setEditManagerForm(p => ({ ...p, email: e.target.value }))}
                />
              </div>

              <div className="dash-form-grid" style={{ marginBottom: '0.9rem' }}>
                <div>
                  <label className="dash-label">Department *</label>
                  <input
                    type="text"
                    required
                    className="dash-input"
                    value={editManagerForm.department}
                    onChange={e => setEditManagerForm(p => ({ ...p, department: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="dash-label">Designation</label>
                  <input
                    type="text"
                    className="dash-input"
                    value={editManagerForm.designation}
                    onChange={e => setEditManagerForm(p => ({ ...p, designation: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label className="dash-label">Contact Number</label>
                <input
                  type="tel"
                  className="dash-input"
                  value={editManagerForm.phone}
                  onChange={e => setEditManagerForm(p => ({ ...p, phone: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => setShowEditManagerModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="dash-btn-primary">
                  Save Manager Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 3: ADD / EDIT STAKEHOLDER (CENTRAL DIRECTORY)
         ══════════════════════════════════════════════════════════════ */}
      {showStakeholderModal && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal animate-fade-in">
            <div className="dash-modal-header">
              <div>
                <h3 className="dash-modal-title">
                  {editingStakeholder ? 'Edit Stakeholder Record' : 'Add Stakeholder to Central Directory'}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Stakeholders are maintained as directory records and do not require an application password.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStakeholderModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveStakeholder}>
              <div className="dash-form-section-title">Personal Information</div>
              <div className="dash-form-grid">
                <div>
                  <label className="dash-label">Full Name *</label>
                  <input
                    type="text"
                    className="dash-input"
                    placeholder="Enter full name"
                    value={stakeholderForm.fullName}
                    onChange={e => {
                      setStakeholderForm(p => ({ ...p, fullName: e.target.value }));
                      if (stakeholderFormErrors.fullName) setStakeholderFormErrors(p => ({ ...p, fullName: null }));
                    }}
                    style={stakeholderFormErrors.fullName ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
                  />
                  {stakeholderFormErrors.fullName && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {stakeholderFormErrors.fullName}
                    </span>
                  )}
                </div>
                <div>
                  <label className="dash-label">Official Work Email Address *</label>
                  <input
                    type="email"
                    className="dash-input"
                    placeholder="user@domain.in"
                    value={stakeholderForm.email}
                    onChange={e => {
                      setStakeholderForm(p => ({ ...p, email: e.target.value }));
                      if (stakeholderFormErrors.email) setStakeholderFormErrors(p => ({ ...p, email: null }));
                    }}
                    style={stakeholderFormErrors.email ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
                  />
                  {stakeholderFormErrors.email && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {stakeholderFormErrors.email}
                    </span>
                  )}
                </div>
                <div>
                  <label className="dash-label">Alternate Email Address (Optional)</label>
                  <input
                    type="email"
                    className="dash-input"
                    placeholder="user@example.com"
                    value={stakeholderForm.alternateEmail}
                    onChange={e => {
                      setStakeholderForm(p => ({ ...p, alternateEmail: e.target.value }));
                      if (stakeholderFormErrors.alternateEmail) setStakeholderFormErrors(p => ({ ...p, alternateEmail: null }));
                    }}
                    style={stakeholderFormErrors.alternateEmail ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
                  />
                  {stakeholderFormErrors.alternateEmail && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {stakeholderFormErrors.alternateEmail}
                    </span>
                  )}
                </div>
                <div>
                  <label className="dash-label">Contact Number (Optional)</label>
                  <input
                    type="tel"
                    className="dash-input"
                    placeholder="Enter 10-digit phone number"
                    value={stakeholderForm.contact}
                    onChange={e => {
                      setStakeholderForm(p => ({ ...p, contact: e.target.value }));
                      if (stakeholderFormErrors.contact) setStakeholderFormErrors(p => ({ ...p, contact: null }));
                    }}
                    style={stakeholderFormErrors.contact ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
                  />
                  {stakeholderFormErrors.contact && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {stakeholderFormErrors.contact}
                    </span>
                  )}
                </div>
              </div>

              <div className="dash-form-section-title">Organisational Information</div>
              {(() => {
                const isExternalCategory = ['Customer', 'Supplier', 'External Partner', 'Other'].includes(stakeholderForm.category);
                return (
                  <div className="dash-form-grid">
                    <div>
                      <label className="dash-label">
                        {isExternalCategory ? 'Department (Optional for External)' : 'Department *'}
                      </label>
                      <input
                        type="text"
                        className="dash-input"
                        placeholder={isExternalCategory ? 'e.g. Client Accounts / External (Optional)' : 'e.g. Computer Science / HR / Finance'}
                        value={stakeholderForm.department}
                        onChange={e => {
                          setStakeholderForm(p => ({ ...p, department: e.target.value }));
                          if (stakeholderFormErrors.department) setStakeholderFormErrors(p => ({ ...p, department: null }));
                        }}
                        style={stakeholderFormErrors.department ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
                      />
                      {stakeholderFormErrors.department && (
                        <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                          {stakeholderFormErrors.department}
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="dash-label">
                        {isExternalCategory ? 'Designation (Optional for External)' : 'Designation *'}
                      </label>
                      <input
                        type="text"
                        className="dash-input"
                        placeholder={isExternalCategory ? 'e.g. Customer / Vendor Representative (Optional)' : 'e.g. Professor / Senior Analyst'}
                        value={stakeholderForm.designation}
                        onChange={e => {
                          setStakeholderForm(p => ({ ...p, designation: e.target.value }));
                          if (stakeholderFormErrors.designation) setStakeholderFormErrors(p => ({ ...p, designation: null }));
                        }}
                        style={stakeholderFormErrors.designation ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
                      />
                      {stakeholderFormErrors.designation && (
                        <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                          {stakeholderFormErrors.designation}
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="dash-label">Stakeholder Category *</label>
                      <select
                        className="dash-select"
                        value={stakeholderForm.category}
                        onChange={e => {
                          const cat = e.target.value;
                          setStakeholderForm(p => ({ ...p, category: cat }));
                          if (['Customer', 'Supplier', 'External Partner', 'Other'].includes(cat)) {
                            setStakeholderFormErrors(p => ({ ...p, department: null, designation: null }));
                          }
                        }}
                      >
                        {PRESET_CATEGORIES.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="CUSTOM">+ Type Custom Category...</option>
                      </select>
                    </div>
                    <div>
                      <label className="dash-label">Employee / Stakeholder ID (Optional)</label>
                      <input
                        type="text"
                        className="dash-input"
                        placeholder="e.g. EMP-1001"
                        value={stakeholderForm.employeeId}
                        onChange={e => setStakeholderForm(p => ({ ...p, employeeId: e.target.value }))}
                      />
                    </div>
                  </div>
                );
              })()}

              {stakeholderForm.category === 'CUSTOM' && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label className="dash-label">Custom Stakeholder Category *</label>
                  <input
                    type="text"
                    className="dash-input"
                    placeholder="Enter custom category (e.g. Alumni, Board Member, Legal Counsel)..."
                    value={stakeholderForm.customCategory}
                    onChange={e => {
                      setStakeholderForm(p => ({ ...p, customCategory: e.target.value }));
                      if (stakeholderFormErrors.customCategory) setStakeholderFormErrors(p => ({ ...p, customCategory: null }));
                    }}
                    style={stakeholderFormErrors.customCategory ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
                  />
                  {stakeholderFormErrors.customCategory && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                      {stakeholderFormErrors.customCategory}
                    </span>
                  )}
                </div>
              )}

              <div className="dash-form-section-title">Account &amp; Participation Status</div>
              <div className="dash-form-grid" style={{ marginBottom: '1.25rem' }}>
                <div>
                  <label className="dash-label">Stakeholder Status</label>
                  {editingStakeholder ? (
                    <select
                      className="dash-select"
                      value={stakeholderForm.status}
                      onChange={e => setStakeholderForm(p => ({ ...p, status: e.target.value }))}
                    >
                      <option value="Active">Active (Verified &amp; Selectable)</option>
                      <option value="Inactive">Inactive (Excluded from new consultations)</option>
                      <option value="Not Registered">Not Registered (Awaiting verification)</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      disabled
                      className="dash-input"
                      value="Not Registered (Verification email dispatched upon save)"
                      style={{ opacity: 0.8, fontWeight: '600' }}
                    />
                  )}
                </div>
                <div>
                  <label className="dash-label">Additional Notes (Optional)</label>
                  <input
                    type="text"
                    className="dash-input"
                    placeholder="Committee membership or notes..."
                    value={stakeholderForm.notes}
                    onChange={e => setStakeholderForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => setShowStakeholderModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="dash-btn-primary">
                  {editingStakeholder ? 'Update Stakeholder' : 'Save Stakeholder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 4: CSV & EXCEL BULK IMPORT FOR STAKEHOLDERS
         ══════════════════════════════════════════════════════════════ */}
      {showBulkCsvModal && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal dash-modal--wide animate-fade-in">
            <div className="dash-modal-header">
              <div>
                <h3 className="dash-modal-title">Bulk Import Stakeholders</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Upload an Excel (<code>.xlsx</code> / <code>.xls</code>) or <code>.csv</code> spreadsheet, or paste rows below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkCsvModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <label className="dash-btn-primary dash-btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> Choose Excel / CSV File
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                    onChange={handleCsvFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="dash-btn-secondary dash-btn-sm"
                  onClick={handleDownloadSampleExcel}
                >
                  <Download size={13} /> Sample Excel (.xlsx)
                </button>
                <button
                  type="button"
                  className="dash-btn-secondary dash-btn-sm"
                  onClick={handleDownloadSampleCsv}
                >
                  <Download size={13} /> Sample CSV
                </button>
              </div>
            </div>

            {uploadedFileName && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                marginBottom: '1rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                color: 'var(--sentiment-positive, #15803d)',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}>
                <CheckCircle2 size={14} />
                <span>Loaded File: <strong>{uploadedFileName}</strong> ({csvPreviewRows.length} valid row{csvPreviewRows.length === 1 ? '' : 's'} ready to import)</span>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="dash-label" style={{ marginBottom: 0, fontWeight: 600, fontSize: '0.82rem' }}>
                  Or paste rows directly:
                </label>
                <button
                  type="button"
                  onClick={() => handleCsvTextChange(SAMPLE_CSV_CONTENT)}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-accent)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Fill sample rows
                </button>
              </div>
              <textarea
                rows={3}
                className="dash-textarea"
                style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
                placeholder="Paste spreadsheet rows or CSV data here..."
                value={csvRawText}
                onChange={e => handleCsvTextChange(e.target.value)}
              />
            </div>

            {csvPreviewRows.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.45rem' }}>
                  Preview Parsed Stakeholders ({csvPreviewRows.length} valid rows ready)
                </div>
                <div className="dash-table-wrap" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Full Name</th>
                        <th>Official Email</th>
                        <th>Department</th>
                        <th>Designation</th>
                        <th>Category</th>
                        <th>Emp ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreviewRows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: '600' }}>{r.fullName}</td>
                          <td>{r.email}</td>
                          <td>{r.department}</td>
                          <td>{r.designation}</td>
                          <td>
                            <span className="category-badge">{r.category}</span>
                          </td>
                          <td>{r.employeeId || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => setShowBulkCsvModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dash-btn-primary"
                disabled={csvPreviewRows.length === 0 || importingCsv}
                onClick={handleConfirmCsvImport}
              >
                {importingCsv ? 'Importing...' : `Import ${csvPreviewRows.length} Stakeholder(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 5: CAMPAIGN DETAILS & STAKEHOLDER INVITATION STATUS
         ══════════════════════════════════════════════════════════════ */}
      <CampaignDetailsModal
        isOpen={showCampaignDetailsModal}
        onClose={() => {
          setShowCampaignDetailsModal(false);
          setCampaignDetails(null);
        }}
        campaign={campaignDetails?.campaign}
        questions={campaignDetails?.questions || []}
        participants={campaignDetails?.participants || []}
        onEditDraft={c => {
          setShowCampaignDetailsModal(false);
          openEditCampaign(c);
        }}
        onDelete={c => {
          setShowCampaignDetailsModal(false);
          openDeleteCampaignModal(c);
        }}
      />

      {/* ══════════════════════════════════════════════════════════════
          MODAL 6: MANAGE DRAFT PARTICIPANTS (WITH FILTERS & COHORT CHIPS)
         ══════════════════════════════════════════════════════════════ */}
      {showParticipantsModal && managingCampaign && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal dash-modal--wide animate-fade-in">
            <div className="dash-modal-header">
              <div>
                <h3 className="dash-modal-title">Assign Stakeholders to Campaign</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {managingCampaign.title} — Only active directory stakeholders are selectable.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowParticipantsModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="dash-filter-bar" style={{ marginBottom: '0.75rem' }}>
              <div className="dash-search-box">
                <Search size={14} />
                <input
                  type="text"
                  className="dash-search-input"
                  placeholder="Search active stakeholders by name or email..."
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                />
              </div>

              <select
                className="dash-filter-select"
                value={pickerDept}
                onChange={e => setPickerDept(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                {shDepartments.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                className="dash-filter-select"
                value={pickerCat}
                onChange={e => setPickerCat(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                {shCategories.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="dash-cohort-chips">
              <button
                type="button"
                className="dash-cohort-chip"
                onClick={() => {
                  const ids = filteredPickerStakeholders.map(s => s.id);
                  setSelectedStakeholderIds(prev => [...new Set([...prev, ...ids])]);
                }}
              >
                + Select Matching Filter ({filteredPickerStakeholders.length})
              </button>
              {shCategories.slice(0, 4).map(cat => (
                <button
                  key={cat}
                  type="button"
                  className="dash-cohort-chip"
                  onClick={() =>
                    applyCohortSelection(
                      setSelectedStakeholderIds,
                      selectedStakeholderIds,
                      s => s.category === cat
                    )
                  }
                >
                  + All {cat}
                </button>
              ))}
              {selectedStakeholderIds.length > 0 && (
                <button
                  type="button"
                  className="dash-cohort-chip"
                  style={{ color: 'var(--sentiment-negative)' }}
                  onClick={() => setSelectedStakeholderIds([])}
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="dash-table-wrap" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1.25rem' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px' }}></th>
                    <th>Stakeholder Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPickerStakeholders.map(s => {
                    const checked = selectedStakeholderIds.includes(s.id);
                    return (
                      <tr
                        key={s.id}
                        onClick={() =>
                          setSelectedStakeholderIds(prev =>
                            prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                          )
                        }
                        style={{
                          cursor: 'pointer',
                          background: checked ? 'rgba(194, 65, 12, 0.06)' : undefined,
                        }}
                      >
                        <td>
                          <input type="checkbox" checked={checked} onChange={() => {}} />
                        </td>
                        <td style={{ fontWeight: '600' }}>
                          {s.first_name} {s.last_name}
                        </td>
                        <td>{s.email}</td>
                        <td>{s.department}</td>
                        <td>{s.designation}</td>
                        <td>
                          <span className="category-badge">{s.category}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>
                {selectedStakeholderIds.length} active stakeholder(s) selected
              </span>
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => setShowParticipantsModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="dash-btn-primary"
                  onClick={handleSaveParticipants}
                >
                  Save Assigned Stakeholders
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 7: EDIT CAMPAIGN
         ══════════════════════════════════════════════════════════════ */}
      {showEditCampaignModal && editingCampaign && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal animate-fade-in">
            <div className="dash-modal-header">
              <h3 className="dash-modal-title">Edit Campaign ({editingCampaign.status})</h3>
              <button
                type="button"
                onClick={() => setShowEditCampaignModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditCampaign}>
              {editingCampaign.status === 'OPEN' ? (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    This consultation is currently <strong>OPEN</strong>. Title and questions are locked to preserve deliberation integrity, but you may extend the closing date.
                  </p>
                  <label className="dash-label">Updated Closing Date *</label>
                  <input
                    type="date"
                    required
                    className="dash-input"
                    value={campaignForm.closingDate}
                    onChange={e => setCampaignForm(p => ({ ...p, closingDate: e.target.value }))}
                  />
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <label className="dash-label">Campaign Title *</label>
                    <input
                      type="text"
                      required
                      className="dash-input"
                      value={campaignForm.title}
                      onChange={e => setCampaignForm(p => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <label className="dash-label">Description</label>
                    <textarea
                      className="dash-textarea"
                      style={{
                        width: '100%',
                        maxWidth: '100%',
                        height: '120px',
                        minHeight: '120px',
                        maxHeight: '120px',
                        resize: 'none',
                        overflowY: 'auto',
                        boxSizing: 'border-box',
                      }}
                      value={campaignForm.description}
                      onChange={e => setCampaignForm(p => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <label className="dash-label">Objectives</label>
                    <input
                      type="text"
                      className="dash-input"
                      value={campaignForm.objectives}
                      onChange={e => setCampaignForm(p => ({ ...p, objectives: e.target.value }))}
                    />
                  </div>
                  <div className="dash-form-grid" style={{ marginBottom: '1rem' }}>
                    <div>
                      <label className="dash-label">Opening Date *</label>
                      <input
                        type="date"
                        required
                        className="dash-input"
                        value={campaignForm.openingDate}
                        onChange={e => setCampaignForm(p => ({ ...p, openingDate: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="dash-label">Closing Date *</label>
                      <input
                        type="date"
                        required
                        className="dash-input"
                        value={campaignForm.closingDate}
                        onChange={e => setCampaignForm(p => ({ ...p, closingDate: e.target.value }))}
                      />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => setShowEditCampaignModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="dash-btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 8: DELETE CAMPAIGN WITH AUDIT REASON
         ══════════════════════════════════════════════════════════════ */}
      {showDeleteCampaignModal && deletingCampaign && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal animate-fade-in" style={{ maxWidth: '480px' }}>
            <div className="dash-modal-header">
              <h3 className="dash-modal-title">Delete Consultation Campaign</h3>
              <button
                type="button"
                onClick={() => setShowDeleteCampaignModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmDeleteCampaign}>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                You are archiving &amp; soft-deleting <strong>{deletingCampaign.title}</strong> ({deletingCampaign.campaign_code}). It will be recorded in the Deleted Campaign History log.
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <label className="dash-label">Reason for Deletion *</label>
                <input
                  type="text"
                  required
                  className="dash-input"
                  placeholder="e.g. Superseded by revised 2026 policy framework"
                  value={deletionReason}
                  onChange={e => setDeletionReason(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => setShowDeleteCampaignModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="dash-btn-primary">
                  Confirm Delete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 9: CAMPAIGN RESPONSES & SENTIMENT VIEW
         ══════════════════════════════════════════════════════════════ */}
      {showResponsesModal && (
        <div className="dash-modal-backdrop">
          <div className="dash-modal dash-modal--wide animate-fade-in">
            <div className="dash-modal-header">
              <div>
                <h3 className="dash-modal-title">
                  {responsesData?.campaign?.title || 'Submitted Stakeholder Feedback'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Campaign Code: {responsesData?.campaign?.campaignCode} · Status:{' '}
                  {responsesData?.campaign?.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowResponsesModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {loadingResponses ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Loading responses...
              </div>
            ) : !responsesData || responsesData.responses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                No feedback responses recorded for this campaign yet.
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1rem', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Showing {responsesData.responses.length} of {responsesData.pagination.total} submissions. Stakeholder identities are anonymised to protect deliberation candour.
                </div>

                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th style={{ width: '25%' }}>Question</th>
                        <th>Stakeholder Comment</th>
                        <th style={{ width: '15%' }}>Participant</th>
                        <th style={{ width: '18%' }}>Sentiment Classification</th>
                        <th style={{ width: '14%' }}>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {responsesData.responses.map(resp => (
                        <tr key={resp.id}>
                          <td style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            Q{resp.questionOrder}: {resp.questionText}
                          </td>
                          <td style={{ lineHeight: '1.5' }}>{resp.text}</td>
                          <td style={{ fontWeight: '700', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                            {resp.author}
                          </td>
                          <td>
                            <span className="category-badge">{resp.sentiment || 'Not analysed yet'}</span>
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {new Date(resp.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {responsesData.pagination.totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                      type="button"
                      className="dash-btn-secondary dash-btn-sm"
                      disabled={responsesPage <= 1}
                      onClick={() => openResponsesView(responsesData.campaign.id, responsesPage - 1)}
                    >
                      Previous
                    </button>
                    <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.84rem' }}>
                      Page {responsesPage} of {responsesData.pagination.totalPages}
                    </span>
                    <button
                      type="button"
                      className="dash-btn-secondary dash-btn-sm"
                      disabled={responsesPage >= responsesData.pagination.totalPages}
                      onClick={() => openResponsesView(responsesData.campaign.id, responsesPage + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
