import classNames from 'classnames';
import { ReactNode, useEffect, useState } from 'react';
import {
  LegTweaksTmpChangeT,
  LegTweaksTmpClearT,
  ResetType,
  RpcMessage,
  SettingsRequestT,
  StepMountingStatus,
  StepMountingStatusResponseT,
} from 'solarxr-protocol';
import { Navbar } from './Navbar';
import { TopBar } from './TopBar';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import './MainLayout.scss';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { TrackingChecklistMobile } from './tracking-checklist/TrackingChecklist';
import { useTrackingChecklist } from '@/hooks/tracking-checklist';
import { useBreakpoint } from '@/hooks/breakpoint';
import { Typography } from './commons/Typography';
import { CheckIcon } from './commons/icon/CheckIcon';
import { CrossIcon } from './commons/icon/CrossIcon';
import { ProgressBar } from './commons/ProgressBar';
import { BaseModal } from './commons/BaseModal';
import { ResetButton } from './home/ResetButton';
import { Button } from './commons/Button';
import { TipBox } from './commons/TipBox';
import { useLocalization } from '@fluent/react';

const statusSteps = [
  // Order matters be carefull
  StepMountingStatus.NONE,
  StepMountingStatus.WAITING_FOR_MOVEMENT,
  StepMountingStatus.WAITING_FOR_REST,
  StepMountingStatus.PROCESSING,
  StepMountingStatus.DONE
];

const errorSteps = [
  StepMountingStatus.ERROR_TIMEOUT,
  StepMountingStatus.ERROR_HIGH_ERROR
];

const progressSteps: StepMountingStatus[] = statusSteps.filter(
  (s) => s !== StepMountingStatus.NONE
);

function Stepper({ status}: { status: StepMountingStatus }) {
  const stepIndex = progressSteps.indexOf(status);
  const isError = errorSteps.includes(status);
  const progress = isError ? 1 : (stepIndex + 1) / progressSteps.length;

  const { isXs } = useBreakpoint('xs');

  return (
    <div className="flex flex-col gap-2 px-2">
      <div className="flex gap-2 items-center">
        <div
          className={classNames(
            'w-8 aspect-square rounded-full fill-background-10 flex items-center justify-center',
            {
              'bg-background-70':
                status !== StepMountingStatus.DONE && !isError,
              'bg-accent-background-10':
                status === StepMountingStatus.DONE,
              'bg-status-critical': isError,
            }
          )}
        >
          {status !== StepMountingStatus.DONE && !isError && (
            <Typography variant={isXs ? 'section-title' : 'standard'}>
              {stepIndex + 1}
            </Typography>
          )}
          {status === StepMountingStatus.DONE && (
            <CheckIcon size={12} />
          )}
          {isError && <CrossIcon />}
        </div>
        <Typography
          id={`step_mounting-${StepMountingStatus[status]}`}
          variant={isXs ? 'section-title' : 'standard'}
        />
      </div>
      <ProgressBar
        progress={progress}
        animated
        colorClass={
          status === StepMountingStatus.DONE
            ? 'bg-status-success'
            : isError
              ? 'bg-status-critical'
              : undefined
        }
      />
    </div>
  );
}

function StepMountingStatusModal({
  isOpen,
  status,
  onCancel,
}: {
  isOpen: boolean;
  status: StepMountingStatus;
  onCancel: () => void;
}) {
  const { l10n } = useLocalization();
  return <BaseModal isOpen={isOpen}>
    <div className="flex flex-col h-full rounded-t-lg xs:rounded-b-lg bg-background-60 xs:py-2 px-2 pt-4 relative">
      <div className="flex flex-col bg-background-60 rounded-lg">
        <div className="px-4 hidden xs:block">
          <Typography
            variant="mobile-title"
            id="step_mounting-title"
          />
        </div>
        <div className="flex flex-col py-2">
          <Stepper status={status} />
        </div>

        <TipBox>{l10n.getString('step_mounting-head_rotation_tip')}</TipBox>

        {status >= StepMountingStatus.ERROR_TIMEOUT && (
          <>
            <ResetButton type={ResetType.Mounting} group="default" />
            <Button variant="tertiary" onClick={onCancel}>
              <Typography id="step_mounting-cancel" />
            </Button>
          </>
        )}
      </div>
    </div>
  </BaseModal>;
}

export function MainLayout({
  children,
  background = true,
  full = false,
  isMobile = undefined,
}: {
  children: ReactNode;
  background?: boolean;
  isMobile?: boolean;
  showToolbarSettings?: boolean;
  full?: boolean;
}) {
  const { completion } = useTrackingChecklist();
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const [ProportionsLastPageOpen, setProportionsLastPageOpen] = useState(true);
  const [stepMountingStatus, setStepMountingStatus] = useState(StepMountingStatus.NONE);

  useEffect(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, []);

  useRPCPacket(RpcMessage.StepMountingStatusResponse, (status: StepMountingStatusResponseT) => setStepMountingStatus(status.status));

  function usePageChanged(callback: () => void) {
    useEffect(() => {
      callback();
    }, [location.pathname]);
  }

  usePageChanged(() => {
    if (location.pathname.includes('body-proportions')) {
      const tempSettings = new LegTweaksTmpChangeT();
      tempSettings.skatingCorrection = false;
      tempSettings.floorClip = false;
      tempSettings.toeSnap = false;
      tempSettings.footPlant = false;

      sendRPCPacket(RpcMessage.LegTweaksTmpChange, tempSettings);
    } else if (ProportionsLastPageOpen) {
      const resetSettings = new LegTweaksTmpClearT();
      resetSettings.skatingCorrection = true;
      resetSettings.floorClip = true;
      resetSettings.toeSnap = true;
      resetSettings.footPlant = true;

      sendRPCPacket(RpcMessage.LegTweaksTmpClear, resetSettings);
    }
    setProportionsLastPageOpen(location.pathname.includes('body-proportions'));
  });

  return (
    <div
      className={classNames('main-layout w-full h-screen', full && 'full', {
        'checklist-ok': completion === 'complete',
      })}
    >
      <div style={{ gridArea: 't' }}>
        <TopBar />
      </div>
      <div style={{ gridArea: 'n' }} className="overflow-y-auto">
        <Navbar />
      </div>

      <div
        style={{ gridArea: 'c' }}
        className={classNames(
          'overflow-y-auto mr-2 my-2 mobile:m-0',
          'flex flex-col rounded-md',
          background && 'bg-background-70',
          { 'rounded-t-none': !isMobile && full }
        )}
      >
        {children}
      </div>
      {full && isMobile && completion !== 'complete' && (
        <TrackingChecklistMobile />
      )}
      {full && (
        <div style={{ gridArea: 'b' }}>
          <Toolbar />
        </div>
      )}
      {!isMobile && full && (
        <div style={{ gridArea: 's' }} className="mr-2">
          <Sidebar />
        </div>
      )}

      <StepMountingStatusModal
        isOpen={stepMountingStatus != StepMountingStatus.NONE && stepMountingStatus != StepMountingStatus.DONE}
        status={stepMountingStatus}
        onCancel={() => setStepMountingStatus(StepMountingStatus.NONE)}
      />
    </div>
  );
}
