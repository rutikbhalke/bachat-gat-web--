import React, { useState, useCallback, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AddMemberModal from '../forms/AddMemberModal';
import RecordSavingsModal from '../forms/RecordSavingsModal';
import CreateLoanModal from '../forms/CreateLoanModal';
import RecordRepaymentModal from '../forms/RecordRepaymentModal';
import BulkSavingsModal from '../forms/BulkSavingsModal';

const MainLayout = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isRecordSavingsOpen, setIsRecordSavingsOpen] = useState(false);
  const [isBulkSavingsOpen, setIsBulkSavingsOpen] = useState(false);
  const [isCreateLoanOpen, setIsCreateLoanOpen] = useState(false);
  const [isRecordRepaymentOpen, setIsRecordRepaymentOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const openAddMember = useCallback(() => setIsAddMemberOpen(true), []);
  const openRecordSavings = useCallback(() => setIsRecordSavingsOpen(true), []);
  const openBulkSavings = useCallback(() => setIsBulkSavingsOpen(true), []);
  const openCreateLoan = useCallback(() => setIsCreateLoanOpen(true), []);
  const openRecordRepayment = useCallback(() => setIsRecordRepaymentOpen(true), []);
  const closeMobileSidebar = useCallback(() => setIsMobileSidebarOpen(false), []);
  const openMobileSidebar = useCallback(() => setIsMobileSidebarOpen(true), []);

  const outletContext = useMemo(
    () => ({
      refreshTrigger,
      triggerRefresh,
      openAddMember,
      openRecordSavings,
      openBulkSavings,
      openCreateLoan,
      openRecordRepayment,
    }),
    [
      refreshTrigger,
      triggerRefresh,
      openAddMember,
      openRecordSavings,
      openBulkSavings,
      openCreateLoan,
      openRecordRepayment,
    ]
  );

  return (
    <div className="app-container">
      <Sidebar isMobileOpen={isMobileSidebarOpen} onCloseMobile={closeMobileSidebar} />

      <div className="main-content">
        <Header
          onOpenMobileSidebar={openMobileSidebar}
          onOpenAddMember={openAddMember}
          onOpenRecordSavings={openRecordSavings}
          onOpenCreateLoan={openCreateLoan}
        />

        <main className="page-body">
          <Outlet context={outletContext} />
        </main>
      </div>

      {/* Global Modals */}
      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        onSuccess={triggerRefresh}
      />

      <RecordSavingsModal
        isOpen={isRecordSavingsOpen}
        onClose={() => setIsRecordSavingsOpen(false)}
        onSuccess={triggerRefresh}
      />

      <BulkSavingsModal
        isOpen={isBulkSavingsOpen}
        onClose={() => setIsBulkSavingsOpen(false)}
        onSuccess={triggerRefresh}
      />

      <CreateLoanModal
        isOpen={isCreateLoanOpen}
        onClose={() => setIsCreateLoanOpen(false)}
        onSuccess={triggerRefresh}
      />

      <RecordRepaymentModal
        isOpen={isRecordRepaymentOpen}
        onClose={() => setIsRecordRepaymentOpen(false)}
        onSuccess={triggerRefresh}
      />
    </div>
  );
};

export default MainLayout;
