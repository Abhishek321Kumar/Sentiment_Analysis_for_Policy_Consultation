import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, UserPlus, AlertCircle, CheckCircle2,
  Building2, ShieldCheck, Copy, ArrowRight, ArrowLeft,
  RotateCw, KeyRound, Check, Upload, Globe, MapPin,
  Users, Layers, Plus, X, Edit3, Sun, Moon, User
} from 'lucide-react';
import api from '../services/api';
import LocationFields from '../components/LocationFields';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getOrgMonogram } from '../utils/monogram';
import './RegisterPage.css';

const PASSWORD_RULES = [
  { label: 'At least 8 characters',        test: v => v.length >= 8 },
  { label: 'One uppercase letter',          test: v => /[A-Z]/.test(v) },
  { label: 'One number',                    test: v => /\d/.test(v) },
  { label: 'One special character (!@#$)',  test: v => /[!@#$%^&*]/.test(v) },
];

export const ORG_TYPE_OPTIONS = [
  'Private Company',
  'Educational Institution',
  'Hospital / Clinic',
  'Bank / Financial Organisation',
  'Non-Governmental Organisation (NGO)',
  'Professional Association',
  'Membership Organisation',
  'Retail / Service Organisation',
  'Other (Private Institution)',
];

export const INDUSTRY_OPTIONS = [
  'Information Technology',
  'Education',
  'Healthcare',
  'Finance and Banking',
  'Manufacturing',
  'Retail',
  'Consulting',
  'Telecommunications',
  'Other',
];

export const ORG_SIZE_OPTIONS = [
  { id: 'Micro (1–10 employees)', label: 'Micro', range: '1–10 employees' },
  { id: 'Small (11–50 employees)', label: 'Small', range: '11–50 employees' },
  { id: 'Medium (51–250 employees)', label: 'Medium', range: '51–250 employees' },
  { id: 'Large (251–1000 employees)', label: 'Large', range: '251–1000 employees' },
  { id: 'Enterprise (1000+ employees)', label: 'Enterprise', range: '1000+ employees' },
];

export const ORG_STRUCTURE_OPTIONS = ['Centralised', 'Decentralised', 'Hybrid'];

export const COMMON_DEPARTMENTS = [
  'Human Resources',
  'Finance',
  'Information Technology',
  'Operations',
  'Marketing',
  'Sales',
  'Administration',
  'Research and Development',
  'Customer Support',
  'Other',
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { user, login, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Top-level flow: 'form' (Admin Registration) -> 'otp' (Email OTP) -> 'profile' (Full-Page 4-Step Org Wizard) -> 'org_code'
  const [step, setStep] = useState('form');

  // Inside 'profile' (Full-Page Organisation Registration Wizard): Steps 1 to 4
  const [orgWizardStep, setOrgWizardStep] = useState(1);

  // Step 1 (Initial Split-Screen): Admin Registration Form State
  const [form, setForm] = useState({
    orgName: '',
    fullName: '',
    designation: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  });

  // Step 2: OTP State
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Full-Page 4-Step Organisation Wizard State
  const [orgData, setOrgData] = useState({
    // Wizard Step 1: Basic Information
    organisationName: '',
    displayName: '',
    organisationType: 'Private Company',
    industry: 'Information Technology',
    website: '',
    logo: '',
    logoFileName: '',
    description: '',
    yearEstablished: '',

    // Wizard Step 2: Location and Contact Information
    country: '',
    state: '',
    city: '',
    registeredAddress: '',
    postalCode: '',
    contactEmail: '',
    contactNumber: '',
    domain: '',

    // Wizard Step 3: Organisation Size and Structure
    companySize: 'Medium (51–250 employees)',
    employeeCount: '',
    departmentCount: '',
    branchCount: '',
    primaryDepartments: ['Administration', 'Human Resources', 'Information Technology'],
    organisationStructure: 'Centralised',

    // Wizard Step 4: Initial Administrator Account & Review
    adminFullName: '',
    adminDesignation: 'Chief Governance & Policy Administrator',
    adminEmail: '',
    adminPhone: '',
    acceptOrgTerms: true,
  });

  // Step 4 Modal for Editing Administrator Details
  const [showEditAdminModal, setShowEditAdminModal] = useState(false);
  const [tempAdminData, setTempAdminData] = useState({
    adminFullName: '',
    adminDesignation: '',
    adminPhone: '',
  });
  const [tempAdminErrors, setTempAdminErrors] = useState({});

  const [customDeptInput, setCustomDeptInput] = useState('');
  const [wizardErrors, setWizardErrors] = useState({});

  // Secret Org Code State
  const [generatedOrgCode, setGeneratedOrgCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Validation & UI State
  const [errors, setErrors] = useState({});
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [resendMessage, setResendMessage] = useState('');

  const isManualEditingAdminRef = useRef(false);

  // If user is already logged in as Admin but hasn't completed org profile, jump straight to full-page wizard
  useEffect(() => {
    if (user && user.profileCompleted === false && step === 'form' && !isManualEditingAdminRef.current) {
      const emailDomain = (user.email || '').split('@')[1] || '';
      setOrgData(prev => ({
        ...prev,
        organisationName: user.orgName || prev.organisationName,
        contactEmail: user.email || prev.contactEmail,
        contactNumber: user.phone || prev.contactNumber,
        domain: emailDomain || prev.domain,
        adminFullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || prev.adminFullName,
        adminDesignation: user.designation || prev.adminDesignation,
        adminEmail: user.email || prev.adminEmail,
        adminPhone: user.phone || prev.adminPhone,
      }));
      setForm(prev => ({
        ...prev,
        orgName: user.orgName || prev.orgName,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || prev.fullName,
        designation: user.designation || prev.designation,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
      }));
      setStep('profile');
    }
  }, [user, step]);

  const handleBackToAdminForm = () => {
    isManualEditingAdminRef.current = true;
    setForm(prev => ({
      ...prev,
      orgName: orgData.organisationName || prev.orgName,
      fullName: orgData.adminFullName || prev.fullName,
      designation: orgData.adminDesignation || prev.designation,
      email: orgData.adminEmail || prev.email,
      phone: orgData.adminPhone || prev.phone,
    }));
    setStep('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle countdown timer for OTP resend
  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleFormChange = e => {
    const { name, value, type, checked } = e.target;
    let finalVal = type === 'checkbox' ? checked : value;
    if (name === 'phone') {
      finalVal = value.replace(/\D/g, '').slice(0, 10);
    }
    setForm(p => ({ ...p, [name]: finalVal }));
    if (errors[name]) setErrors(p => ({ ...p, [name]: '' }));
    if (apiError) setApiError('');
  };

  const handleOrgFieldChange = e => {
    const { name, value, type, checked } = e.target;
    let finalVal = type === 'checkbox' ? checked : value;
    if (name === 'contactNumber' || name === 'adminPhone') {
      finalVal = value.replace(/\D/g, '').slice(0, 10);
    }
    setOrgData(p => ({ ...p, [name]: finalVal }));
    if (wizardErrors[name]) setWizardErrors(p => ({ ...p, [name]: '' }));
    if (apiError) setApiError('');
  };

  // Logo Upload Handler (converts image file to Data URL for preview & storage)
  const handleLogoUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setWizardErrors(p => ({ ...p, logo: 'Logo file size must be under 2 MB.' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = evt => {
      setOrgData(p => ({
        ...p,
        logo: String(evt.target?.result || ''),
        logoFileName: file.name,
      }));
      setWizardErrors(p => ({ ...p, logo: '' }));
    };
    reader.readAsDataURL(file);
  };

  // Toggle Primary Department Chip
  const toggleDepartmentChip = dept => {
    setOrgData(p => {
      const exists = p.primaryDepartments.includes(dept);
      return {
        ...p,
        primaryDepartments: exists
          ? p.primaryDepartments.filter(d => d !== dept)
          : [...p.primaryDepartments, dept],
      };
    });
  };

  // Add Custom Department
  const handleAddCustomDepartment = () => {
    const trimmed = customDeptInput.trim();
    if (!trimmed) return;
    if (!orgData.primaryDepartments.includes(trimmed)) {
      setOrgData(p => ({
        ...p,
        primaryDepartments: [...p.primaryDepartments, trimmed],
      }));
    }
    setCustomDeptInput('');
  };

  const validateStep1 = () => {
    const errs = {};
    const orgTrim = form.orgName.trim();
    if (!orgTrim) {
      errs.orgName = 'Organisation name is required.';
    } else if (/^\d+$/.test(orgTrim)) {
      errs.orgName = 'Organisation name cannot consist only of numbers.';
    } else if (!/[a-zA-Z]/.test(orgTrim)) {
      errs.orgName = 'Organisation name must contain letters.';
    } else if (orgTrim.length < 2) {
      errs.orgName = 'Organisation name must be at least 2 characters.';
    }

    const nameTrim = form.fullName.trim();
    if (!nameTrim) {
      errs.fullName = 'Administrator full name is required.';
    } else if (/^\d+$/.test(nameTrim)) {
      errs.fullName = 'Administrator name cannot consist only of numbers.';
    } else if (!/^[a-zA-Z\s.'-]{2,60}$/.test(nameTrim)) {
      errs.fullName = 'Administrator name must contain only letters (no numbers or special symbols).';
    }

    const desigTrim = form.designation.trim();
    if (!desigTrim) {
      errs.designation = 'Administrator designation is required.';
    } else if (/^\d+$/.test(desigTrim)) {
      errs.designation = 'Designation cannot consist only of numbers.';
    } else if (!/[a-zA-Z]/.test(desigTrim)) {
      errs.designation = 'Designation must contain letters (e.g. Chief Executive Officer, Registrar).';
    }

    const emailTrim = form.email.trim();
    if (!emailTrim) {
      errs.email = 'Official work email is required.';
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailTrim)) {
      errs.email = 'Enter a valid official email address.';
    }

    const phoneTrim = form.phone.trim();
    if (!phoneTrim) {
      errs.phone = 'Contact number is required.';
    } else if (/[a-zA-Z]/.test(phoneTrim) || /[^\d\s+-]/.test(phoneTrim)) {
      errs.phone = 'Phone number must contain only digits (no alphabets or special symbols).';
    } else {
      const digitsOnly = phoneTrim.replace(/\D/g, '');
      const tenDigits = digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;
      if (tenDigits.length !== 10) {
        errs.phone = 'Phone number must be exactly 10 digits.';
      }
    }

    const pwFails = PASSWORD_RULES.filter(r => !r.test(form.password));
    if (!form.password)         errs.password = 'Password is required.';
    else if (pwFails.length)    errs.password = 'Password must meet all requirements.';

    if (!form.confirmPassword)  errs.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match.';

    if (!form.agreeTerms)       errs.agreeTerms = 'You must accept the terms to continue.';
    return errs;
  };

  // Step 1: Validate Admin & Org inputs and transition to wizard (In-memory only; no DB write yet)
  const handleRegisterSubmit = e => {
    e.preventDefault();
    const errs = validateStep1();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setApiError('');
    isManualEditingAdminRef.current = false;

    // Pre-fill Organisation Wizard fields from Admin Registration inputs into in-memory state
    const emailDomain = (form.email.split('@')[1] || '').toLowerCase();
    setOrgData(prev => ({
      ...prev,
      organisationName: form.orgName.trim(),
      contactEmail: form.email.trim().toLowerCase(),
      contactNumber: form.phone.trim(),
      domain: emailDomain,
      adminFullName: form.fullName.trim(),
      adminDesignation: form.designation.trim(),
      adminEmail: form.email.trim().toLowerCase(),
      adminPhone: form.phone.trim(),
    }));

    setOrgWizardStep(1);
    setStep('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveTempAdmin = () => {
    const errs = {};
    const nameTrim = tempAdminData.adminFullName.trim();
    if (!nameTrim) {
      errs.fullName = 'Administrator full name is required.';
    } else if (/^\d+$/.test(nameTrim) || !/^[a-zA-Z\s.'-]{2,60}$/.test(nameTrim)) {
      errs.fullName = 'Full name must contain only letters (no numbers or special symbols).';
    }

    const desigTrim = tempAdminData.adminDesignation.trim();
    if (!desigTrim) {
      errs.designation = 'Administrator designation is required.';
    } else if (/^\d+$/.test(desigTrim) || !/[a-zA-Z]/.test(desigTrim)) {
      errs.designation = 'Designation must contain letters (e.g. Chief Executive Officer, Registrar).';
    }

    const phoneTrim = tempAdminData.adminPhone.trim();
    if (!phoneTrim) {
      errs.phone = 'Contact number is required.';
    } else if (/[a-zA-Z]/.test(phoneTrim) || /[^\d\s+-]/.test(phoneTrim)) {
      errs.phone = 'Phone number must contain only digits (no alphabets or special symbols).';
    } else {
      const digitsOnly = phoneTrim.replace(/\D/g, '');
      const tenDigits = digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;
      if (tenDigits.length !== 10) {
        errs.phone = 'Phone number must be exactly 10 digits.';
      }
    }

    if (Object.keys(errs).length > 0) {
      setTempAdminErrors(errs);
      return;
    }

    setOrgData(p => ({
      ...p,
      adminFullName: nameTrim,
      adminDesignation: desigTrim,
      adminPhone: phoneTrim,
    }));
    setShowEditAdminModal(false);
  };

  // Submit Step 2: Verify OTP
  const handleVerifyOtp = async e => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      setApiError('Please enter a valid 6-digit verification code.');
      return;
    }

    setLoading(true);
    setApiError('');

    try {
      const res = await api.post('/auth/verify-otp', {
        email: form.email,
        otp: otp.trim(),
      });

      login(res.token, res.user);
      setLoading(false);

      if (res.requiresProfile) {
        const u = res.user || {};
        const emailDomain = (u.email || form.email || '').split('@')[1] || '';
        const adminName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || form.fullName;
        setOrgData(prev => ({
          ...prev,
          organisationName: u.orgName || form.orgName || prev.organisationName,
          contactEmail: u.email || form.email || prev.contactEmail,
          contactNumber: u.phone || form.phone || prev.contactNumber,
          domain: emailDomain || prev.domain,
          adminFullName: adminName || prev.adminFullName,
          adminDesignation: u.designation || form.designation || prev.adminDesignation,
          adminEmail: u.email || form.email || prev.adminEmail,
          adminPhone: u.phone || form.phone || prev.adminPhone,
        }));
        setOrgWizardStep(1);
        setStep('profile');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setLoading(false);
      setApiError(err.message || 'Invalid or expired verification code.');
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    setApiError('');
    setResendMessage('');

    try {
      await api.post('/auth/resend-otp', { email: form.email });
      setCooldown(60);
      setResendMessage('A new verification code has been dispatched to your email.');
    } catch (err) {
      setApiError(err.message || 'Failed to resend code.');
    }
  };

  // Validate individual steps of the 4-Step Full-Page Organisation Wizard
  const validateOrgWizardStep = targetStep => {
    const errs = {};

    if (targetStep === 1) {
      const orgName = orgData.organisationName.trim();
      if (!orgName) {
        errs.organisationName = 'Organisation Name is required.';
      } else if (/^\d+$/.test(orgName)) {
        errs.organisationName = 'Organisation Name cannot consist solely of numbers.';
      } else if (!/[a-zA-Z]/.test(orgName)) {
        errs.organisationName = 'Organisation Name must contain letters.';
      } else if (orgName.length < 2) {
        errs.organisationName = 'Organisation Name must be at least 2 characters.';
      }

      if (orgData.displayName.trim() && /^\d+$/.test(orgData.displayName.trim())) {
        errs.displayName = 'Display Name cannot consist solely of numbers.';
      }

      if (!orgData.organisationType) {
        errs.organisationType = 'Organisation Type is required.';
      } else if (orgData.organisationType.toLowerCase().includes('government')) {
        errs.organisationType = 'Only private institutions are eligible for registration.';
      }

      if (!orgData.industry) {
        errs.industry = 'Industry / Sector is required.';
      }

      if (orgData.website.trim() && !/^https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(orgData.website.trim())) {
        errs.website = 'Website must start with http:// or https:// and include a valid domain.';
      }

      if (orgData.yearEstablished) {
        const yr = Number(orgData.yearEstablished);
        const currentYr = new Date().getFullYear();
        if (isNaN(yr) || yr < 1800 || yr > currentYr) {
          errs.yearEstablished = `Enter a valid 4-digit year between 1800 and ${currentYr}.`;
        }
      }
    }

    if (targetStep === 2) {
      const countryTrim = orgData.country.trim();
      if (!countryTrim) {
        errs.country = 'Country is required.';
      } else if (/^\d+$/.test(countryTrim) || !/^[\p{L}\s.'(),-]{2,80}$/u.test(countryTrim)) {
        errs.country = 'Country must contain valid characters.';
      }

      const stateTrim = orgData.state.trim();
      if (!stateTrim) {
        errs.state = 'State / Province is required.';
      } else if (/^\d+$/.test(stateTrim) || !/^[\p{L}\s.'(),-]{2,80}$/u.test(stateTrim)) {
        errs.state = 'State / Province must contain valid characters.';
      }

      const cityTrim = orgData.city.trim();
      if (!cityTrim) {
        errs.city = 'City is required.';
      } else if (/^\d+$/.test(cityTrim) || !/^[\p{L}\s.'(),-]{2,80}$/u.test(cityTrim)) {
        errs.city = 'City must contain valid characters.';
      }

      if (orgData.postalCode.trim() && !/^[a-zA-Z0-9\s-]{3,10}$/.test(orgData.postalCode.trim())) {
        errs.postalCode = 'Postal code must be 3-10 alphanumeric characters.';
      }

      if (!orgData.contactEmail.trim()) {
        errs.contactEmail = 'Official Contact Email is required.';
      } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(orgData.contactEmail.trim())) {
        errs.contactEmail = 'Enter a valid Official Contact Email address.';
      }

      const contactNum = (orgData.contactNumber || '').trim();
      if (!contactNum) {
        errs.contactNumber = 'Official Contact Number is required.';
      } else if (/[a-zA-Z]/.test(contactNum) || /[^\d\s+-]/.test(contactNum)) {
        errs.contactNumber = 'Contact number must contain only digits (no alphabets or special symbols).';
      } else {
        const digits = contactNum.replace(/\D/g, '');
        const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
        if (ten.length !== 10) {
          errs.contactNumber = 'Contact number must be exactly 10 digits.';
        }
      }

      const cleanDomain = orgData.domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');
      if (!cleanDomain) {
        errs.domain = 'Organisation Domain is required (e.g. company.com).';
      } else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cleanDomain)) {
        errs.domain = 'Enter a valid domain format such as company.com or institute.edu';
      }
    }

    if (targetStep === 3) {
      if (!orgData.companySize) {
        errs.companySize = 'Please select an Organisation Size Category.';
      }
      if (!orgData.employeeCount || Number(orgData.employeeCount) < 1) {
        errs.employeeCount = 'Approximate Employee / Member Count is required (minimum 1).';
      }
      if (!orgData.departmentCount || Number(orgData.departmentCount) < 1) {
        errs.departmentCount = 'Number of Departments is required (minimum 1).';
      }
      if (!orgData.primaryDepartments || orgData.primaryDepartments.length === 0) {
        errs.primaryDepartments = 'Select at least one primary department.';
      }
    }

    if (targetStep === 4) {
      if (!orgData.acceptOrgTerms) {
        errs.acceptOrgTerms = 'Please confirm and accept the institutional terms to complete registration.';
      }
    }

    setWizardErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleWizardNext = () => {
    setApiError('');
    if (validateOrgWizardStep(orgWizardStep)) {
      setOrgWizardStep(s => Math.min(4, s + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleWizardPrev = () => {
    setApiError('');
    setOrgWizardStep(s => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Final Submit of Full-Page 4-Step Organisation Wizard
  const handleCompleteOrganisationWizard = async e => {
    e.preventDefault();
    setApiError('');

    // Validate all 4 steps before submitting
    for (let s = 1; s <= 4; s++) {
      if (!validateOrgWizardStep(s)) {
        setOrgWizardStep(s);
        return;
      }
    }

    setLoading(true);
    try {
      const cleanDomain = orgData.domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');

      let res;
      if (user && user.id && user.profileCompleted === false) {
        // Authenticated admin completing pre-existing tenant profile
        res = await api.put('/organisation/profile', {
          name: orgData.organisationName.trim(),
          displayName: orgData.displayName.trim(),
          orgType: orgData.organisationType,
          industry: orgData.industry,
          website: orgData.website.trim(),
          logo: orgData.logo,
          description: orgData.description.trim(),
          yearEstablished: orgData.yearEstablished ? Number(orgData.yearEstablished) : null,
          country: orgData.country.trim(),
          state: orgData.state.trim(),
          city: orgData.city.trim(),
          registeredAddress: orgData.registeredAddress.trim(),
          postalCode: orgData.postalCode.trim(),
          contactEmail: orgData.contactEmail.trim(),
          contactNumber: orgData.contactNumber.trim(),
          domain: cleanDomain,
          size: orgData.companySize,
          employeeCount: Number(orgData.employeeCount),
          departmentCount: Number(orgData.departmentCount),
          branchCount: orgData.branchCount ? Number(orgData.branchCount) : null,
          primaryDepartments: orgData.primaryDepartments,
          organisationStructure: orgData.organisationStructure,
          expectedStakeholders: Number(orgData.employeeCount),
          adminFullName: orgData.adminFullName.trim(),
          adminDesignation: orgData.adminDesignation.trim(),
          adminPhone: orgData.adminPhone.trim(),
        });

        const org = res.organisation;
        setGeneratedOrgCode(org.orgCode);
        updateUser({
          orgName: org.name,
          displayName: org.displayName,
          orgCode: org.orgCode,
          profileCompleted: true,
          orgType: org.orgType,
          industry: org.industry,
          size: org.size,
          website: org.website,
          logoUrl: org.logoUrl,
          description: org.description,
          yearEstablished: org.yearEstablished,
          domain: org.domain,
          country: org.country,
          state: org.state,
          city: org.city,
          departmentCount: org.departmentCount,
          employeeCount: org.employeeCount,
          branchCount: org.branchCount,
          organisationStructure: org.organisationStructure,
          orgCreatedAt: org.createdAt,
          designation: orgData.adminDesignation.trim(),
        });
      } else {
        // Atomic Registration: Write organisation and initial administrator to database only after entire wizard is completed
        res = await api.post('/organisation/register', {
          organisationName: orgData.organisationName.trim(),
          displayName: orgData.displayName.trim(),
          organisationType: orgData.organisationType,
          industry: orgData.industry,
          website: orgData.website.trim(),
          logo: orgData.logo,
          description: orgData.description.trim(),
          yearEstablished: orgData.yearEstablished ? Number(orgData.yearEstablished) : null,
          country: orgData.country.trim(),
          state: orgData.state.trim(),
          city: orgData.city.trim(),
          registeredAddress: orgData.registeredAddress.trim(),
          postalCode: orgData.postalCode.trim(),
          contactEmail: orgData.contactEmail.trim(),
          contactNumber: orgData.contactNumber.trim(),
          domain: cleanDomain,
          companySize: orgData.companySize,
          employeeCount: Number(orgData.employeeCount),
          departmentCount: Number(orgData.departmentCount),
          branchCount: orgData.branchCount ? Number(orgData.branchCount) : null,
          primaryDepartments: orgData.primaryDepartments,
          organisationStructure: orgData.organisationStructure,
          fullName: orgData.adminFullName.trim(),
          designation: orgData.adminDesignation.trim(),
          email: (orgData.adminEmail || form.email).trim().toLowerCase(),
          phone: orgData.adminPhone.trim() || form.phone.trim(),
          password: form.password,
        });

        // Log user into new administrator session with returned JWT token & user profile
        login(res.token, res.user);
        setGeneratedOrgCode(res.organisation?.orgCode || res.user?.orgCode);
      }

      setLoading(false);
      setStep('org_code');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setLoading(false);
      setApiError(err.message || 'Failed to save organisation profile.');
    }
  };

  // Copy Org Code to clipboard
  const handleCopyCode = () => {
    if (!generatedOrgCode) return;
    navigator.clipboard.writeText(generatedOrgCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER 1: FULL-PAGE ORGANISATION REGISTRATION WIZARD (Steps 'profile' & 'org_code')
  // Spans the entire viewport width as requested by user
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 'profile' || step === 'org_code') {
    const wizardStepsMeta = [
      { num: 1, title: 'Basic Information', sub: 'Identity & Sector' },
      { num: 2, title: 'Location & Contact', sub: 'Address & Domain' },
      { num: 3, title: 'Size & Structure', sub: 'Scale & Departments' },
      { num: 4, title: 'Admin & Review', sub: 'Verify & Submit' },
    ];

    const orgInitials = getOrgMonogram(orgData.organisationName);
    const adminDisplayName =
      orgData.adminFullName?.trim() ||
      (user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '') ||
      (form.fullName ? form.fullName.trim() : form.firstName ? `${form.firstName} ${form.lastName || ''}`.trim() : '') ||
      'Administrator';

    return (
      <div className="reg-page reg-page--fullwidth">
        {/* Top Bar */}
        <header className="org-wiz-topbar">
          <Link to="/" className="org-wiz-brand">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--brand-accent)" />
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9" />
              <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)" />
            </svg>
            <span>PotentPolicy</span>
          </Link>

          <div className="org-wiz-topbar__meta">
            <span className="step-badge" style={{ margin: 0 }}>
              Institutional Onboarding
            </span>
            <div className="org-wiz-user-pill">
              <User size={13} style={{ color: 'var(--brand-accent)' }} />
              <strong>{adminDisplayName}</strong>
            </div>
            <Link to="/" className="org-wiz-back-home" title="Return to Home Page">
              <ArrowLeft size={14} />
              <span>Back to Home</span>
            </Link>
            <button
              type="button"
              className="reg-theme-btn"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <div className="org-wiz-container">
          {step === 'profile' && (
            <div className="animate-fade-in">
              <div className="org-wiz-header">
                <h1 className="org-wiz-header__title">Complete Organisation Registration</h1>
                <p className="org-wiz-header__sub">
                  Configure your institutional profile, governance structure, and official domain across 4 guided steps to activate your consultation workspace.
                </p>
              </div>

              {/* 4-Step Progress Indicator */}
              <div className="org-wiz-stepper">
                {wizardStepsMeta.map(ws => {
                  const isCompleted = orgWizardStep > ws.num;
                  const isActive = orgWizardStep === ws.num;
                  return (
                    <button
                      key={ws.num}
                      type="button"
                      className={`org-wiz-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                      disabled={ws.num > orgWizardStep}
                      onClick={() => {
                        if (ws.num < orgWizardStep) setOrgWizardStep(ws.num);
                      }}
                    >
                      <div className="org-wiz-step__num">
                        {isCompleted ? <Check size={15} /> : ws.num}
                      </div>
                      <div>
                        <div className="org-wiz-step__label">Step {ws.num} of 4</div>
                        <div className="org-wiz-step__title">{ws.title}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {apiError && (
                <div className="reg-alert" style={{ marginBottom: '1.25rem' }}>
                  <AlertCircle size={16} />
                  <span>{apiError}</span>
                </div>
              )}

              {/* Wizard Card */}
              <form className="org-wiz-card" onSubmit={handleCompleteOrganisationWizard} noValidate>
                {/* ── WIZARD STEP 1: ORGANISATION BASIC INFORMATION ── */}
                {orgWizardStep === 1 && (
                  <div className="animate-fade-in">
                    <div className="org-wiz-card__head">
                      <div>
                        <h2 className="org-wiz-card__title">Step 1: Organisation Basic Information</h2>
                        <p className="org-wiz-card__desc">
                          Provide your official institutional name, sector classification, logo, and foundational details.
                        </p>
                      </div>
                      <Building2 size={24} color="var(--brand-accent)" />
                    </div>

                    <div className="org-wiz-grid-2">
                      <div className="form-group">
                        <label className="form-label">Organisation Name *</label>
                        <input
                          type="text"
                          name="organisationName"
                          className={`form-input ${wizardErrors.organisationName ? 'error' : ''}`}
                          placeholder="Enter organisation name"
                          value={orgData.organisationName}
                          onChange={handleOrgFieldChange}
                        />
                        {wizardErrors.organisationName && (
                          <span className="form-error">{wizardErrors.organisationName}</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Display Name (Optional)</label>
                        <input
                          type="text"
                          name="displayName"
                          className="form-input"
                          placeholder="Enter display name"
                          value={orgData.displayName}
                          onChange={handleOrgFieldChange}
                        />
                      </div>
                    </div>

                    <div className="org-wiz-grid-2">
                      <div className="form-group">
                        <label className="form-label">Organisation Type *</label>
                        <select
                          name="organisationType"
                          className={`form-input ${wizardErrors.organisationType ? 'error' : ''}`}
                          value={orgData.organisationType}
                          onChange={handleOrgFieldChange}
                        >
                          {ORG_TYPE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        {wizardErrors.organisationType && (
                          <span className="form-error">{wizardErrors.organisationType}</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Industry / Sector *</label>
                        <select
                          name="industry"
                          className={`form-input ${wizardErrors.industry ? 'error' : ''}`}
                          value={orgData.industry}
                          onChange={handleOrgFieldChange}
                        >
                          {INDUSTRY_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        {wizardErrors.industry && (
                          <span className="form-error">{wizardErrors.industry}</span>
                        )}
                      </div>
                    </div>

                    <div className="org-wiz-grid-2">
                      <div className="form-group">
                        <label className="form-label">Official Website (Optional)</label>
                        <input
                          type="url"
                          name="website"
                          className={`form-input ${wizardErrors.website ? 'error' : ''}`}
                          placeholder="https://www.organisation.org"
                          value={orgData.website}
                          onChange={handleOrgFieldChange}
                        />
                        {wizardErrors.website && (
                          <span className="form-error">{wizardErrors.website}</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Year Established (Optional)</label>
                        <input
                          type="number"
                          name="yearEstablished"
                          className={`form-input ${wizardErrors.yearEstablished ? 'error' : ''}`}
                          placeholder="e.g. 1995"
                          min="1800"
                          max={new Date().getFullYear()}
                          value={orgData.yearEstablished}
                          onChange={handleOrgFieldChange}
                        />
                        {wizardErrors.yearEstablished && (
                          <span className="form-error">{wizardErrors.yearEstablished}</span>
                        )}
                      </div>
                    </div>

                    <div className="org-wiz-grid-2">
                      <div className="form-group">
                        <label className="form-label">Organisation Logo (Optional File Upload)</label>
                        <div className="org-logo-upload">
                          <div className="org-logo-preview">
                            {orgData.logo ? (
                              <img src={orgData.logo} alt="Organisation Logo Preview" />
                            ) : (
                              <span>{orgInitials}</span>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <label className="org-wiz-btn-secondary" style={{ padding: '0.42rem 0.85rem', fontSize: '0.78rem' }}>
                                <Upload size={13} /> Upload Logo
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleLogoUpload}
                                  style={{ display: 'none' }}
                                />
                              </label>
                              {orgData.logo && (
                                <button
                                  type="button"
                                  className="org-wiz-btn-secondary"
                                  style={{ padding: '0.42rem 0.7rem', fontSize: '0.75rem', color: 'var(--sentiment-negative)' }}
                                  onClick={() => setOrgData(p => ({ ...p, logo: '', logoFileName: '' }))}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              {orgData.logoFileName || 'PNG, JPG or SVG (max 2 MB). Displayed on your Admin Dashboard.'}
                            </div>
                          </div>
                        </div>
                        {wizardErrors.logo && <span className="form-error">{wizardErrors.logo}</span>}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Organisation Description (Optional)</label>
                        <textarea
                          name="description"
                          rows={3}
                          className="form-input"
                          placeholder="Brief overview of your institution's mission and policy governance scope..."
                          value={orgData.description}
                          onChange={handleOrgFieldChange}
                          style={{ resize: 'vertical' }}
                        />
                      </div>
                    </div>

                    <div className="org-wiz-footer">
                      <button
                        type="button"
                        className="org-wiz-btn-secondary"
                        onClick={handleBackToAdminForm}
                      >
                        <ArrowLeft size={15} /> Edit Administrator Account
                      </button>
                      <button type="button" className="org-wiz-btn-primary" onClick={handleWizardNext}>
                        Continue to Location &amp; Contact <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── WIZARD STEP 2: LOCATION AND CONTACT INFORMATION ── */}
                {orgWizardStep === 2 && (
                  <div className="animate-fade-in">
                    <div className="org-wiz-card__head">
                      <div>
                        <h2 className="org-wiz-card__title">Step 2: Location and Contact Information</h2>
                        <p className="org-wiz-card__desc">
                          Specify your registered headquarters location, official contact channels, and corporate email domain.
                        </p>
                      </div>
                      <MapPin size={24} color="var(--brand-accent)" />
                    </div>

                    <div className="org-wiz-grid-3">
                      <LocationFields
                        country={orgData.country}
                        state={orgData.state}
                        city={orgData.city}
                        postalCode={orgData.postalCode}
                        onChange={(field, val) => {
                          setOrgData(prev => ({ ...prev, [field]: val }));
                          if (wizardErrors[field]) {
                            setWizardErrors(prev => ({ ...prev, [field]: '' }));
                          }
                        }}
                        errors={wizardErrors}
                        variant="wizard"
                      />
                    </div>

                    <div className="org-wiz-grid-2">
                      <div className="form-group">
                        <label className="form-label">Registered Office Address (Optional)</label>
                        <input
                          type="text"
                          name="registeredAddress"
                          className="form-input"
                          placeholder="Street address, campus block, or building..."
                          value={orgData.registeredAddress}
                          onChange={handleOrgFieldChange}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Postal / ZIP Code (Optional)</label>
                        <input
                          type="text"
                          name="postalCode"
                          className="form-input"
                          placeholder="e.g. 560001"
                          value={orgData.postalCode}
                          onChange={handleOrgFieldChange}
                        />
                      </div>
                    </div>

                    <div className="org-wiz-grid-3">
                      <div className="form-group">
                        <label className="form-label">Official Contact Email *</label>
                        <input
                          type="email"
                          name="contactEmail"
                          className={`form-input ${wizardErrors.contactEmail ? 'error' : ''}`}
                          placeholder="contact@domain.in"
                          value={orgData.contactEmail}
                          onChange={handleOrgFieldChange}
                        />
                        {wizardErrors.contactEmail && (
                          <span className="form-error">{wizardErrors.contactEmail}</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Official Contact Number (Optional)</label>
                        <input
                          type="tel"
                          name="contactNumber"
                          className="form-input"
                          placeholder="Enter 10-digit phone number"
                          value={orgData.contactNumber}
                          onChange={handleOrgFieldChange}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Organisation Domain *</label>
                        <input
                          type="text"
                          name="domain"
                          className={`form-input ${wizardErrors.domain ? 'error' : ''}`}
                          placeholder="e.g. domain.in"
                          value={orgData.domain}
                          onChange={handleOrgFieldChange}
                        />
                        {wizardErrors.domain && <span className="form-error">{wizardErrors.domain}</span>}
                      </div>
                    </div>

                    <div
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '0.75rem 1rem',
                        fontSize: '0.79rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Globe size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem', color: 'var(--brand-accent)' }} />
                      <strong>Domain Governance Policy:</strong> The organisation domain (e.g. <code>{orgData.domain || 'company.com'}</code>) identifies official work email addresses, but does not automatically grant access to every person using that domain. Stakeholder eligibility remains strictly controlled by the Administrator through the Central Stakeholder Directory.
                    </div>

                    <div className="org-wiz-footer">
                      <button type="button" className="org-wiz-btn-secondary" onClick={handleWizardPrev}>
                        <ArrowLeft size={15} /> Previous Step
                      </button>
                      <button type="button" className="org-wiz-btn-primary" onClick={handleWizardNext}>
                        Continue to Size &amp; Structure <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── WIZARD STEP 3: ORGANISATION SIZE AND STRUCTURE ── */}
                {orgWizardStep === 3 && (
                  <div className="animate-fade-in">
                    <div className="org-wiz-card__head">
                      <div>
                        <h2 className="org-wiz-card__title">Step 3: Organisation Size and Structure</h2>
                        <p className="org-wiz-card__desc">
                          Define your workforce scale, governance topology, and primary institutional departments.
                        </p>
                      </div>
                      <Layers size={24} color="var(--brand-accent)" />
                    </div>

                    <div style={{ marginBottom: '0.45rem' }}>
                      <label className="form-label">Organisation Size Category *</label>
                    </div>
                    <div className="org-size-grid">
                      {ORG_SIZE_OPTIONS.map(sz => {
                        const isSelected = orgData.companySize === sz.id;
                        return (
                          <div
                            key={sz.id}
                            className={`org-size-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setOrgData(p => ({ ...p, companySize: sz.id }))}
                          >
                            <div className="org-size-card__name">{sz.label}</div>
                            <div className="org-size-card__range">{sz.range}</div>
                          </div>
                        );
                      })}
                    </div>
                    {wizardErrors.companySize && (
                      <span className="form-error" style={{ display: 'block', marginBottom: '0.85rem' }}>
                        {wizardErrors.companySize}
                      </span>
                    )}

                    <div className="org-wiz-grid-2">
                      <div className="form-group">
                        <label className="form-label">Approximate Employee / Member Count *</label>
                        <input
                          type="number"
                          name="employeeCount"
                          min="1"
                          className={`form-input ${wizardErrors.employeeCount ? 'error' : ''}`}
                          placeholder="e.g. 450"
                          value={orgData.employeeCount}
                          onChange={handleOrgFieldChange}
                        />
                        {wizardErrors.employeeCount && (
                          <span className="form-error">{wizardErrors.employeeCount}</span>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Number of Departments *</label>
                        <input
                          type="number"
                          name="departmentCount"
                          min="1"
                          className={`form-input ${wizardErrors.departmentCount ? 'error' : ''}`}
                          placeholder="e.g. 8"
                          value={orgData.departmentCount}
                          onChange={handleOrgFieldChange}
                        />
                        {wizardErrors.departmentCount && (
                          <span className="form-error">{wizardErrors.departmentCount}</span>
                        )}
                      </div>
                    </div>

                    <div className="org-wiz-grid-2">
                      <div className="form-group">
                        <label className="form-label">Number of Branches / Locations (Optional)</label>
                        <input
                          type="number"
                          name="branchCount"
                          min="1"
                          className="form-input"
                          placeholder="e.g. 3"
                          value={orgData.branchCount}
                          onChange={handleOrgFieldChange}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Organisation Structure (Optional)</label>
                        <select
                          name="organisationStructure"
                          className="form-input"
                          value={orgData.organisationStructure}
                          onChange={handleOrgFieldChange}
                        >
                          {ORG_STRUCTURE_OPTIONS.map(st => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">
                        Primary Departments (Select all that apply or add custom departments)
                      </label>
                      <div className="org-dept-chips">
                        {COMMON_DEPARTMENTS.map(dept => {
                          const selected = orgData.primaryDepartments.includes(dept);
                          return (
                            <button
                              key={dept}
                              type="button"
                              className={`org-dept-chip ${selected ? 'selected' : ''}`}
                              onClick={() => toggleDepartmentChip(dept)}
                            >
                              {selected ? <Check size={13} /> : <Plus size={13} />}
                              <span>{dept}</span>
                            </button>
                          );
                        })}

                        {/* Render any custom departments added by user */}
                        {orgData.primaryDepartments
                          .filter(d => !COMMON_DEPARTMENTS.includes(d))
                          .map(customDept => (
                            <button
                              key={customDept}
                              type="button"
                              className="org-dept-chip selected"
                              onClick={() => toggleDepartmentChip(customDept)}
                            >
                              <Check size={13} />
                              <span>{customDept}</span>
                              <X size={12} />
                            </button>
                          ))}
                      </div>

                      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem', maxWidth: '460px' }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Add custom department name (e.g. Legal & Compliance)..."
                          value={customDeptInput}
                          onChange={e => setCustomDeptInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomDepartment();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="org-wiz-btn-secondary"
                          onClick={handleAddCustomDepartment}
                          style={{ whiteSpace: 'nowrap', padding: '0.55rem 1rem' }}
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Note: Department counts entered during registration are approximate. Actual departments and stakeholders are managed by the Administrator in the directory.
                      </span>
                    </div>

                    <div className="org-wiz-footer">
                      <button type="button" className="org-wiz-btn-secondary" onClick={handleWizardPrev}>
                        <ArrowLeft size={15} /> Previous Step
                      </button>
                      <button type="button" className="org-wiz-btn-primary" onClick={handleWizardNext}>
                        Continue to Administrator &amp; Review <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── WIZARD STEP 4: INITIAL ADMINISTRATOR ACCOUNT & REVIEW SUMMARY ── */}
                {orgWizardStep === 4 && (
                  <div className="animate-fade-in">
                    <div className="org-wiz-card__head">
                      <div>
                        <h2 className="org-wiz-card__title">
                          Step 4: Review Registration &amp; Confirm Administrator Account
                        </h2>
                        <p className="org-wiz-card__desc">
                          Review all institutional details and administrator credentials below. To update any section, click its Edit button.
                        </p>
                      </div>
                      <ShieldCheck size={24} color="var(--brand-accent)" />
                    </div>

                    {/* Dedicated Administrator Review Box (Full-Width Card) */}
                    <div className="org-review-box org-review-box--admin">
                      <div className="org-review-box__head">
                        <span className="org-review-box__title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <ShieldCheck size={16} color="var(--brand-accent)" /> Administrator Account Details
                        </span>
                        <button
                          type="button"
                          className="org-review-edit-btn"
                          onClick={() => {
                            setTempAdminData({
                              adminFullName: orgData.adminFullName || adminDisplayName,
                              adminDesignation: orgData.adminDesignation || 'Chief Governance & Policy Administrator',
                              adminPhone: orgData.adminPhone || form.phone,
                            });
                            setTempAdminErrors({});
                            setShowEditAdminModal(true);
                          }}
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                      </div>
                      <div className="org-review-admin-grid">
                        <div className="org-review-item">
                          <span className="org-review-label">Administrator Full Name</span>
                          <span className="org-review-value">{orgData.adminFullName || adminDisplayName}</span>
                        </div>
                        <div className="org-review-item">
                          <span className="org-review-label">Administrator Designation</span>
                          <span className="org-review-value">{orgData.adminDesignation || 'Chief Governance & Policy Administrator'}</span>
                        </div>
                        <div className="org-review-item">
                          <span className="org-review-label">Official Work Email</span>
                          <span className="org-review-value">
                            {orgData.adminEmail || user?.email || form.email}
                            <span className="org-verified-badge"><CheckCircle2 size={11} /> Verified</span>
                          </span>
                        </div>
                        <div className="org-review-item">
                          <span className="org-review-label">Contact Number</span>
                          <span className="org-review-value">{orgData.adminPhone || form.phone || '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Comprehensive 3-Box Registration Review Summary */}
                    <div className="org-review-grid">
                      <div className="org-review-box">
                        <div className="org-review-box__head">
                          <span className="org-review-box__title">1. Basic Information</span>
                          <button
                            type="button"
                            className="org-review-edit-btn"
                            onClick={() => setOrgWizardStep(1)}
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                        </div>
                        <div className="org-review-row">
                          <span>Organisation Name</span>
                          <span>{orgData.organisationName || '—'}</span>
                        </div>
                        {orgData.displayName && (
                          <div className="org-review-row">
                            <span>Display Name</span>
                            <span>{orgData.displayName}</span>
                          </div>
                        )}
                        <div className="org-review-row">
                          <span>Organisation Type</span>
                          <span>{orgData.organisationType}</span>
                        </div>
                        <div className="org-review-row">
                          <span>Industry / Sector</span>
                          <span>{orgData.industry}</span>
                        </div>
                        <div className="org-review-row">
                          <span>Year Established</span>
                          <span>{orgData.yearEstablished || '—'}</span>
                        </div>
                        <div className="org-review-row">
                          <span>Organisation Logo</span>
                          <span>{orgData.logo ? 'Custom Logo Uploaded' : `Default Monogram (${orgInitials})`}</span>
                        </div>
                        {orgData.website && (
                          <div className="org-review-row">
                            <span>Official Website</span>
                            <span>{orgData.website}</span>
                          </div>
                        )}
                      </div>

                      <div className="org-review-box">
                        <div className="org-review-box__head">
                          <span className="org-review-box__title">2. Location &amp; Domain</span>
                          <button
                            type="button"
                            className="org-review-edit-btn"
                            onClick={() => setOrgWizardStep(2)}
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                        </div>
                        <div className="org-review-row">
                          <span>Location</span>
                          <span>{[orgData.city, orgData.state, orgData.country].filter(Boolean).join(', ') || '—'}</span>
                        </div>
                        {orgData.registeredAddress && (
                          <div className="org-review-row">
                            <span>Registered Address</span>
                            <span>{orgData.registeredAddress}</span>
                          </div>
                        )}
                        <div className="org-review-row">
                          <span>Official Contact Email</span>
                          <span>{orgData.contactEmail || '—'}</span>
                        </div>
                        <div className="org-review-row">
                          <span>Contact Number</span>
                          <span>{orgData.contactNumber || '—'}</span>
                        </div>
                        <div className="org-review-row">
                          <span>Organisation Domain</span>
                          <span>{orgData.domain || '—'}</span>
                        </div>
                      </div>

                      <div className="org-review-box" style={{ gridColumn: '1 / -1' }}>
                        <div className="org-review-box__head">
                          <span className="org-review-box__title">3. Size &amp; Structure</span>
                          <button
                            type="button"
                            className="org-review-edit-btn"
                            onClick={() => setOrgWizardStep(3)}
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem 1.5rem', marginTop: '0.5rem' }}>
                          <div className="org-review-row" style={{ border: 'none', padding: '0.2rem 0' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Size Category:</span>
                            <span style={{ fontWeight: '600' }}>{orgData.companySize}</span>
                          </div>
                          <div className="org-review-row" style={{ border: 'none', padding: '0.2rem 0' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Employees / Members:</span>
                            <span style={{ fontWeight: '600' }}>{orgData.employeeCount || '—'}</span>
                          </div>
                          <div className="org-review-row" style={{ border: 'none', padding: '0.2rem 0' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Total Departments:</span>
                            <span style={{ fontWeight: '600' }}>{orgData.departmentCount || '—'}</span>
                          </div>
                          <div className="org-review-row" style={{ border: 'none', padding: '0.2rem 0' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Structure:</span>
                            <span style={{ fontWeight: '600' }}>{orgData.organisationStructure}</span>
                          </div>
                          <div className="org-review-row" style={{ border: 'none', padding: '0.2rem 0', gridColumn: '1 / -1' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Primary Departments:</span>
                            <span style={{ fontWeight: '600' }}>{orgData.primaryDepartments?.join(', ') || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Terms Acceptance */}
                    <div className="reg-terms" style={{ marginTop: '0.75rem' }}>
                      <input
                        id="org-wiz-terms"
                        name="acceptOrgTerms"
                        type="checkbox"
                        className="reg-terms__chk"
                        checked={orgData.acceptOrgTerms}
                        onChange={handleOrgFieldChange}
                      />
                      <label htmlFor="org-wiz-terms" className="reg-terms__label">
                        I confirm that the above organisation and Administrator details are accurate and accept PotentPolicy&apos;s Institutional Terms of Service and Privacy Policy.
                      </label>
                    </div>
                    {wizardErrors.acceptOrgTerms && (
                      <span className="form-error">{wizardErrors.acceptOrgTerms}</span>
                    )}

                    <div className="org-wiz-footer">
                      <button type="button" className="org-wiz-btn-secondary" onClick={handleWizardPrev}>
                        <ArrowLeft size={15} /> Previous Step
                      </button>
                      <button type="submit" className="org-wiz-btn-primary" disabled={loading}>
                        {loading ? (
                          <>
                            <RotateCw size={15} className="spin" /> Completing Organisation Setup...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} /> Submit &amp; Activate Organisation
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* ── STEP 'org_code': FULL-PAGE SECRET ORG CODE CONFIRMATION ── */}
          {step === 'org_code' && (
            <div className="org-wiz-card animate-fade-in" style={{ maxWidth: '640px', margin: '2rem auto', textAlign: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(74, 124, 89, 0.15)',
                  color: 'var(--sentiment-positive)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                }}
              >
                <CheckCircle2 size={36} />
              </div>

              <h1 className="reg-form-header__title" style={{ marginBottom: '0.5rem' }}>
                Organisation Registration Complete!
              </h1>
              <p className="reg-form-header__sub" style={{ margin: '0 auto 1.75rem', maxWidth: '480px' }}>
                <strong>{orgData.organisationName}</strong> is now active on PotentPolicy. Below is your confidential <strong>Organisation Code</strong>:
              </p>

              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '2px dashed var(--brand-accent)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  margin: '0 auto 1.5rem',
                  maxWidth: '400px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <KeyRound size={20} color="var(--brand-accent)" />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1.8rem',
                      fontWeight: '800',
                      letterSpacing: '0.15em',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {generatedOrgCode}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyCode}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.55rem 1.25rem',
                    background: copied ? 'var(--sentiment-positive)' : 'var(--bg-card)',
                    color: copied ? '#ffffff' : 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied to Clipboard!' : 'Copy Organisation Code'}
                </button>
              </div>

              <div
                style={{
                  background: 'rgba(22, 101, 52, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '10px',
                  padding: '0.85rem 1.25rem',
                  maxWidth: '520px',
                  margin: '0 auto 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  textAlign: 'left',
                }}
              >
                <CheckCircle2 size={20} color="var(--sentiment-positive)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.825rem', color: 'var(--text-primary)', lineHeight: '1.45' }}>
                  <strong>Registration Successful!</strong> We have dispatched your confidential Organisation Code and confirmation to <strong>{orgData.adminEmail || form.email}</strong>.
                </div>
              </div>

              <p
                style={{
                  fontSize: '0.84rem',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.55',
                  maxWidth: '460px',
                  margin: '0 auto 2rem',
                }}
              >
                ⚠️ <strong>Keep this code confidential.</strong> Your invited Campaign Managers will use this Organisation Code and their unique activation links to set up their accounts.
              </p>

              <button
                type="button"
                className="reg-submit-btn"
                onClick={() => navigate('/dashboard')}
                style={{ maxWidth: '340px', margin: '0 auto' }}
              >
                Go to Organisation Administrator Dashboard <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>

        {/* ── MODAL: EDIT ADMINISTRATOR DETAILS (FROM STEP 4 REVIEW) ── */}
        {showEditAdminModal && (
          <div className="org-wiz-modal-backdrop" onClick={() => setShowEditAdminModal(false)}>
            <div className="org-wiz-modal-card" onClick={e => e.stopPropagation()}>
              <div className="org-wiz-modal-head">
                <h3 className="org-wiz-modal-title">Edit Administrator Details</h3>
                <button
                  type="button"
                  className="org-wiz-modal-close"
                  onClick={() => setShowEditAdminModal(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="org-wiz-modal-body">
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Administrator Full Name *</label>
                  <input
                    type="text"
                    className={`form-input ${tempAdminErrors.fullName ? 'error' : ''}`}
                    value={tempAdminData.adminFullName}
                    onChange={e => {
                      const v = e.target.value;
                      setTempAdminData(p => ({ ...p, adminFullName: v }));
                      if (tempAdminErrors.fullName) setTempAdminErrors(p => ({ ...p, fullName: '' }));
                    }}
                    placeholder="Enter full name"
                  />
                  {tempAdminErrors.fullName && <span className="form-error">{tempAdminErrors.fullName}</span>}
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Administrator Designation *</label>
                  <input
                    type="text"
                    className={`form-input ${tempAdminErrors.designation ? 'error' : ''}`}
                    value={tempAdminData.adminDesignation}
                    onChange={e => {
                      const v = e.target.value;
                      setTempAdminData(p => ({ ...p, adminDesignation: v }));
                      if (tempAdminErrors.designation) setTempAdminErrors(p => ({ ...p, designation: '' }));
                    }}
                    placeholder="Enter designation"
                  />
                  {tempAdminErrors.designation && <span className="form-error">{tempAdminErrors.designation}</span>}
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Administrator Contact Number *</label>
                  <input
                    type="tel"
                    className={`form-input ${tempAdminErrors.phone ? 'error' : ''}`}
                    value={tempAdminData.adminPhone}
                    maxLength={10}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '');
                      setTempAdminData(p => ({ ...p, adminPhone: v }));
                      if (tempAdminErrors.phone) setTempAdminErrors(p => ({ ...p, phone: '' }));
                    }}
                    placeholder="Enter 10-digit phone number"
                  />
                  {tempAdminErrors.phone && <span className="form-error">{tempAdminErrors.phone}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Official Email Address</label>
                  <input
                    type="text"
                    className="form-input"
                    disabled
                    value={orgData.adminEmail || user?.email || form.email}
                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Work email is verified via OTP and cannot be modified here.
                  </span>
                </div>
              </div>
              <div className="org-wiz-modal-foot">
                <button
                  type="button"
                  className="org-wiz-btn-secondary"
                  onClick={() => setShowEditAdminModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="org-wiz-btn-primary"
                  onClick={handleSaveTempAdmin}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER 2: INITIAL ADMIN REGISTRATION & OTP (Split-Screen Interface Preserved)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="reg-page">
      {/* ── LEFT — Branded Image Panel ── */}
      <div className="reg-image-panel">
        <img
          src="/register-panel.jpg"
          alt="Professional team collaborating on policy consultation"
          className="reg-image-panel__img"
        />
        <div className="reg-image-panel__overlay">
          <Link to="/" className="reg-image-panel__brand">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--brand-accent)" />
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9" />
              <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)" />
            </svg>
            <span>PotentPolicy</span>
          </Link>

          <div className="reg-image-panel__tagline">
            <h2>Bring every voice to the table.</h2>
            <p>Register your organisation and start structured, AI-powered policy consultations today.</p>
            <div className="reg-image-panel__pills">
              <span className="reg-pill"><CheckCircle2 size={12} /> Multi-tenant &amp; secure</span>
              <span className="reg-pill"><CheckCircle2 size={12} /> AI sentiment analysis</span>
              <span className="reg-pill"><CheckCircle2 size={12} /> Real-time dashboards</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT — Wizard Step Panel ── */}
      <div className="reg-form-panel">
        <div className="reg-form-panel__inner">
          {/* Top Bar Actions: Back to Home & Dark Mode Toggle */}
          <div className="reg-top-bar">
            <Link to="/" className="reg-back-link" title="Return to Home Page">
              <ArrowLeft size={15} />
              <span>Back to Home</span>
            </Link>
            <button
              type="button"
              className="reg-theme-btn"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          {/* ═════════ STEP 1: INITIAL REGISTRATION FORM ═════════ */}
          {step === 'form' && (
            <>
              <div className="reg-form-header">
                <h1 className="reg-form-header__title">Register your organisation</h1>
                <p className="reg-form-header__sub">
                  Create the organisation and your administrator account.
                </p>
              </div>

              {isManualEditingAdminRef.current && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      isManualEditingAdminRef.current = false;
                      setStep('profile');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
                  >
                    <ArrowLeft size={14} /> Return to Organisation Wizard
                  </button>
                </div>
              )}

              {apiError && (
                <div className="reg-alert">
                  <AlertCircle size={14} />
                  <span>{apiError}</span>
                </div>
              )}

              <form className="reg-form" onSubmit={handleRegisterSubmit} noValidate>
                <div className="reg-section-label">
                  <Building2 size={13} /> Organisation Details
                </div>

                <div className="reg-row reg-row--full">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-org-name">Organisation Name *</label>
                    <input
                      id="reg-org-name" name="orgName" type="text"
                      className={`form-input ${errors.orgName ? 'error' : ''}`}
                      placeholder="Enter organisation name"
                      value={form.orgName} onChange={handleFormChange} autoFocus
                    />
                    {errors.orgName && <span className="form-error">{errors.orgName}</span>}
                  </div>
                </div>

                <div className="reg-section-label" style={{ marginTop: '0.4rem' }}>
                  <ShieldCheck size={13} /> Administrator Details
                </div>

                <div className="reg-row reg-row--two">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-fullname">Administrator Full Name *</label>
                    <input
                      id="reg-fullname" name="fullName" type="text"
                      className={`form-input ${errors.fullName ? 'error' : ''}`}
                      placeholder="Enter full name"
                      value={form.fullName} onChange={handleFormChange} autoComplete="name"
                    />
                    {errors.fullName && <span className="form-error">{errors.fullName}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-designation">Administrator Designation *</label>
                    <input
                      id="reg-designation" name="designation" type="text"
                      className={`form-input ${errors.designation ? 'error' : ''}`}
                      placeholder="Enter designation"
                      value={form.designation} onChange={handleFormChange}
                    />
                    {errors.designation && <span className="form-error">{errors.designation}</span>}
                  </div>
                </div>

                <div className="reg-row reg-row--two">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-email">Work Email *</label>
                    <input
                      id="reg-email" name="email" type="email"
                      className={`form-input ${errors.email ? 'error' : ''}`}
                      placeholder="user@domain.in"
                      value={form.email} onChange={handleFormChange} autoComplete="email"
                    />
                    {errors.email && <span className="form-error">{errors.email}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-phone">Contact Number (10 Digits) *</label>
                    <input
                      id="reg-phone" name="phone" type="tel"
                      maxLength={10}
                      className={`form-input ${errors.phone ? 'error' : ''}`}
                      placeholder="Enter 10-digit phone number"
                      value={form.phone} onChange={handleFormChange} autoComplete="tel"
                    />
                    {errors.phone && <span className="form-error">{errors.phone}</span>}
                  </div>
                </div>

                <div className="reg-row reg-row--two">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-pass">Password *</label>
                    <div className="form-input-wrap">
                      <input
                        id="reg-pass" name="password"
                        type={showPass ? 'text' : 'password'}
                        className={`form-input ${errors.password ? 'error' : ''}`}
                        placeholder="Create strong password"
                        value={form.password} onChange={handleFormChange} autoComplete="new-password"
                      />
                      <button
                        type="button" className="pass-toggle"
                        onClick={() => setShowPass(p => !p)} tabIndex={-1}
                      >
                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-cpass">Confirm Password *</label>
                    <div className="form-input-wrap">
                      <input
                        id="reg-cpass" name="confirmPassword"
                        type={showConfirm ? 'text' : 'password'}
                        className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                        placeholder="Repeat password"
                        value={form.confirmPassword} onChange={handleFormChange} autoComplete="new-password"
                      />
                      <button
                        type="button" className="pass-toggle"
                        onClick={() => setShowConfirm(p => !p)} tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>

                {errors.password && <span className="form-error" style={{ marginBottom: '0.25rem' }}>{errors.password}</span>}
                {errors.confirmPassword && <span className="form-error" style={{ marginBottom: '0.25rem' }}>{errors.confirmPassword}</span>}

                {/* Password strength rules */}
                {form.password && (
                  <div className="pw-rules">
                    {PASSWORD_RULES.map((r, i) => {
                      const ok = r.test(form.password);
                      return (
                        <div key={i} className={`pw-rule ${ok ? 'pass' : 'fail'}`}>
                          <span className="pw-rule__dot" />
                          <span>{r.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Terms checkbox */}
                <div className="reg-terms">
                  <input
                    id="reg-terms-chk" name="agreeTerms" type="checkbox"
                    className="reg-terms__chk"
                    checked={form.agreeTerms} onChange={handleFormChange}
                  />
                  <label htmlFor="reg-terms-chk" className="reg-terms__label">
                    I confirm that I am authorized to register this organisation and accept the Terms of Service.
                  </label>
                </div>
                {errors.agreeTerms && <span className="form-error">{errors.agreeTerms}</span>}

                <button type="submit" className="reg-submit-btn" disabled={loading}>
                  <span className="reg-submit-btn__inner">
                    Continue to Organisation Details <ArrowRight size={15} />
                  </span>
                </button>
              </form>

              <div className="reg-footer-links">
                Already registered? <Link to="/login">Sign in here</Link>
              </div>
            </>
          )}

          {/* ═════════ STEP 2: EMAIL OTP VERIFICATION ═════════ */}
          {step === 'otp' && (
            <div className="animate-fade-in">
              <div className="reg-form-header">
                <div className="step-badge">Email Verification</div>
                <h1 className="reg-form-header__title">Verify your email</h1>
                <p className="reg-form-header__sub">
                  We&apos;ve sent a 6-digit verification code to <strong>{form.email}</strong>.
                </p>
                <div style={{ marginTop: '0.5rem', fontSize: '0.825rem', color: 'var(--brand-accent)' }}>
                  💡 Demo mode: check incoming OTP in{' '}
                  <a
                    href="http://localhost:5174"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--brand-accent)', textDecoration: 'underline' }}
                  >
                    PotentMail Webmail Client (Port 5174)
                  </a>
                  .
                </div>
              </div>

              {apiError && (
                <div className="reg-alert">
                  <AlertCircle size={14} />
                  <span>{apiError}</span>
                </div>
              )}

              {resendMessage && (
                <div
                  className="reg-alert"
                  style={{
                    background: 'rgba(74, 124, 89, 0.12)',
                    color: 'var(--sentiment-positive)',
                    borderColor: 'rgba(74, 124, 89, 0.3)',
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>{resendMessage}</span>
                </div>
              )}

              <form className="reg-form" onSubmit={handleVerifyOtp}>
                <div className="form-group" style={{ textAlign: 'center', margin: '1.5rem 0' }}>
                  <label className="form-label" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                    Enter 6-Digit OTP Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={e => {
                      setOtp(e.target.value.replace(/\D/g, ''));
                      if (apiError) setApiError('');
                    }}
                    placeholder="123456"
                    className="form-input"
                    style={{
                      fontSize: '1.75rem',
                      letterSpacing: '0.45em',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      fontWeight: '700',
                      padding: '0.85rem',
                    }}
                    autoFocus
                  />
                </div>

                <button type="submit" className="reg-submit-btn" disabled={loading || otp.length !== 6}>
                  {loading ? 'Verifying...' : 'Verify Email & Continue to Organisation Setup'}
                </button>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '1.25rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>Didn&apos;t receive the code?</span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={cooldown > 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: cooldown > 0 ? 'var(--text-muted)' : 'var(--brand-accent)',
                      fontWeight: '600',
                      cursor: cooldown > 0 ? 'default' : 'pointer',
                    }}
                  >
                    {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
