import { useLocalization } from '@fluent/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BodyPart,
  ResetRequestT,
  ResetsSettingsT,
  ResetType,
  RpcMessage,
  SettingsRequestT,
  SettingsResponseT,
  StatusData,
} from 'solarxr-protocol';
import { useConfig } from '@/hooks/config';
import { useCountdown } from '@/hooks/countdown';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import {
  playSoundOnResetEnded,
  playSoundOnResetStarted,
} from '@/sounds/sounds';
import { BigButton } from '@/components/commons/BigButton';
import { Button } from '@/components/commons/Button';
import {
  MountingResetIcon,
  YawResetIcon,
  FullResetIcon,
} from '@/components/commons/icon/ResetIcon';
import { useStatusContext } from '@/hooks/status-system';
import { useAtomValue } from 'jotai';
import { flatTrackersAtom } from '@/store/app-store';
import classNames from 'classnames';
import { FootIcon } from '@/components/commons/icon/FootIcon';
import { FingersIcon } from '@/components/commons/icon/FingersIcon';
import { useInterval } from '@/hooks/timeout';

export function ResetButton({
  type,
  size = 'big',
  bodyPartsToReset = 'default',
  className,
  onReseted,
}: {
  className?: string;
  type: ResetType;
  size: 'big' | 'small';
  bodyPartsToReset?: 'default' | 'feet' | 'fingers';
  onReseted?: () => void;
}) {
  const { l10n } = useLocalization();
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const trackers = useAtomValue(flatTrackersAtom);
  const { statuses } = useStatusContext();
  const { config } = useConfig();
  const finishedTimeoutRef = useRef(-1);
  const [isFinished, setFinished] = useState(false);
  const [resetSettings, setResetSettings] = useState(new ResetsSettingsT());

  const needsFullReset = useMemo(
    () =>
      type === ResetType.Mounting &&
      Object.values(statuses).some(
        (status) => status.dataType === StatusData.StatusTrackerReset
      ),
    [statuses]
  );

  const bodyParts = [
    BodyPart.HEAD,
    BodyPart.NECK,
    BodyPart.CHEST,
    BodyPart.WAIST,
    BodyPart.HIP,
    BodyPart.LEFT_UPPER_LEG,
    BodyPart.RIGHT_UPPER_LEG,
    BodyPart.LEFT_LOWER_LEG,
    BodyPart.RIGHT_LOWER_LEG,
    BodyPart.LEFT_LOWER_ARM,
    BodyPart.RIGHT_LOWER_ARM,
    BodyPart.LEFT_UPPER_ARM,
    BodyPart.RIGHT_UPPER_ARM,
    BodyPart.LEFT_HAND,
    BodyPart.RIGHT_HAND,
    BodyPart.LEFT_SHOULDER,
    BodyPart.RIGHT_SHOULDER,
    BodyPart.UPPER_CHEST,
    BodyPart.LEFT_HIP,
    BodyPart.RIGHT_HIP,
  ];
  const feetBodyParts = [BodyPart.LEFT_FOOT, BodyPart.RIGHT_FOOT];
  const fingerBodyParts = [
    BodyPart.LEFT_THUMB_METACARPAL,
    BodyPart.LEFT_THUMB_PROXIMAL,
    BodyPart.LEFT_THUMB_DISTAL,
    BodyPart.LEFT_INDEX_PROXIMAL,
    BodyPart.LEFT_INDEX_INTERMEDIATE,
    BodyPart.LEFT_INDEX_DISTAL,
    BodyPart.LEFT_MIDDLE_PROXIMAL,
    BodyPart.LEFT_MIDDLE_INTERMEDIATE,
    BodyPart.LEFT_MIDDLE_DISTAL,
    BodyPart.LEFT_RING_PROXIMAL,
    BodyPart.LEFT_RING_INTERMEDIATE,
    BodyPart.LEFT_RING_DISTAL,
    BodyPart.LEFT_LITTLE_PROXIMAL,
    BodyPart.LEFT_LITTLE_INTERMEDIATE,
    BodyPart.LEFT_LITTLE_DISTAL,
    BodyPart.RIGHT_THUMB_METACARPAL,
    BodyPart.RIGHT_THUMB_PROXIMAL,
    BodyPart.RIGHT_THUMB_DISTAL,
    BodyPart.RIGHT_INDEX_PROXIMAL,
    BodyPart.RIGHT_INDEX_INTERMEDIATE,
    BodyPart.RIGHT_INDEX_DISTAL,
    BodyPart.RIGHT_MIDDLE_PROXIMAL,
    BodyPart.RIGHT_MIDDLE_INTERMEDIATE,
    BodyPart.RIGHT_MIDDLE_DISTAL,
    BodyPart.RIGHT_RING_PROXIMAL,
    BodyPart.RIGHT_RING_INTERMEDIATE,
    BodyPart.RIGHT_RING_DISTAL,
    BodyPart.RIGHT_LITTLE_PROXIMAL,
    BodyPart.RIGHT_LITTLE_INTERMEDIATE,
    BodyPart.RIGHT_LITTLE_DISTAL,
  ];

  const isAccelRecording = useMemo(() => {
    let parts: BodyPart[];
    switch (bodyPartsToReset) {
      case 'default':
        parts = bodyParts;
        if (resetSettings.resetMountingFeet)
          parts = parts.concat(feetBodyParts);
        break;
      case 'feet':
        parts = feetBodyParts;
        break;
      case 'fingers':
        parts = fingerBodyParts;
        break;
    }

    const filteredTrackers = parts.length == 0 ? trackers : trackers.filter((tracker) => parts.find((part) => part == tracker.tracker.info?.bodyPart));
    return type === ResetType.Mounting && filteredTrackers.some((tracker) => tracker.tracker.accelRecordingInProgress);
  }, [trackers]);

  useInterval(() => {
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  }, 1000);

  useRPCPacket(RpcMessage.SettingsResponse, ({ resetsSettings }: SettingsResponseT) => {
    if (resetsSettings)
      setResetSettings(resetsSettings!);
  });

  const reset = () => {
    const req = new ResetRequestT();
    req.resetType = type;
    switch (bodyPartsToReset) {
      case 'default':
        // Server handles it. Usually all body parts except fingers.
        req.bodyParts = [];
        break;
      case 'feet':
        req.bodyParts = feetBodyParts;
        break;
      case 'fingers':
        req.bodyParts = fingerBodyParts;
        break;
    }
    sendRPCPacket(RpcMessage.ResetRequest, req);
  };

  const { isCounting, startCountdown, timer } = useCountdown({
    duration: type === ResetType.Yaw ? 0 : undefined,
    onCountdownEnd: () => {
      maybePlaySoundOnResetEnd(type);
      reset();
      if (!resetSettings.stepMounting) {
        setFinished(true);
        if (finishedTimeoutRef.current !== -1)
          clearTimeout(finishedTimeoutRef.current);
        finishedTimeoutRef.current = setTimeout(() => {
          setFinished(false);
          finishedTimeoutRef.current = -1;
        }, 2000) as unknown as number;
      }
      if (onReseted) onReseted();
    },
  });

  const text = useMemo(() => {
    switch (type) {
      case ResetType.Yaw:
        return l10n.getString(
          'reset-yaw' +
            (bodyPartsToReset !== 'default' ? '-' + bodyPartsToReset : '')
        );
      case ResetType.Mounting:
        if (isAccelRecording)
          return l10n.getString('reset-recording_in_progress');
        else
          return l10n.getString(
            'reset-mounting' +
              (bodyPartsToReset !== 'default' ? '-' + bodyPartsToReset : '')
          );
      case ResetType.Full:
        return l10n.getString(
          'reset-full' +
            (bodyPartsToReset !== 'default' ? '-' + bodyPartsToReset : '')
        );
    }
  }, [type, bodyPartsToReset, isAccelRecording]);

  const getIcon = () => {
    switch (type) {
      case ResetType.Yaw:
        return <YawResetIcon width={20} />;
      case ResetType.Mounting:
        switch (bodyPartsToReset) {
          case 'default':
            return <MountingResetIcon width={20} />;
          case 'feet':
            return <FootIcon width={30} />;
          case 'fingers':
            return <FingersIcon width={20} />;
        }
    }
    return <FullResetIcon width={20} />;
  };

  const maybePlaySoundOnResetEnd = (type: ResetType) => {
    if (!config?.feedbackSound) return;
    playSoundOnResetEnded(type, config?.feedbackSoundVolume);
  };

  const maybePlaySoundOnResetStart = () => {
    if (!config?.feedbackSound) return;
    if (type !== ResetType.Yaw)
      playSoundOnResetStarted(config?.feedbackSoundVolume);
  };

  const triggerReset = () => {
    setFinished(false);
    startCountdown();
    maybePlaySoundOnResetStart();
  };

  useEffect(() => {
    return () => {
      if (finishedTimeoutRef.current !== -1)
        clearTimeout(finishedTimeoutRef.current);
    };
  }, []);

  return size === 'small' ? (
    <Button
      icon={getIcon()}
      onClick={triggerReset}
      className={classNames(
        'border-2',
        isFinished && 'border-status-success',
        isAccelRecording && 'border-status-recording',
        (!isFinished && !isAccelRecording) && 'transition-[border-color] duration-500 ease-in-out border-transparent',
        className
      )}
      variant="primary"
      disabled={isCounting || needsFullReset || isAccelRecording}
    >
      {!isCounting || type === ResetType.Yaw ? text : String(timer)}
    </Button>
  ) : (
    <BigButton
      icon={getIcon()}
      onClick={triggerReset}
      className={classNames(
        'border-2',
        isFinished && 'border-status-success',
        isAccelRecording && 'border-status-recording',
        (!isFinished && !isAccelRecording) && 'transition-[border-color] duration-500 ease-in-out border-transparent',
        className
      )}
      disabled={isCounting || needsFullReset || isAccelRecording}
    >
      {!isCounting || type === ResetType.Yaw ? text : String(timer)}
    </BigButton>
  );
}
