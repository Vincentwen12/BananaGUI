import { For } from 'solid-js';
import { Icon } from './Icon';
import { Modal } from './ui';
import type { AppState } from '../state/app';
import { markGuideSeen } from '../lib/guide';

export function Guide(props: { app: AppState }) {
  const { state, t } = props.app;

  const close = () => {
    markGuideSeen();
    props.app.setState('guideOpen', false);
  };

  const openShortcuts = () => {
    markGuideSeen();
    props.app.setState({ guideOpen: false, helpOpen: true });
  };

  const steps = () => [
    { icon: 'spark', title: t().guideStep1, body: t().guideStep1Body },
    { icon: 'message', title: t().guideStep2, body: t().guideStep2Body },
    { icon: 'brain', title: t().guideStep3, body: t().guideStep3Body },
    { icon: 'panel', title: t().guideStep4, body: t().guideStep4Body },
    { icon: 'key', title: t().guideStep5, body: t().guideStep5Body },
  ];

  return (
    <Modal
      open={state.guideOpen}
      title={t().guideTitle}
      wide
      onClose={close}
      footer={
        <div class="dialog-foot">
          <button class="btn" type="button" onClick={openShortcuts}>
            {t().guideShortcuts}
          </button>
          <button class="btn primary" type="button" onClick={close}>
            {t().guideStart}
          </button>
        </div>
      }
    >
      <div class="guide">
        <p class="guide-intro">{t().guideIntro}</p>
        <div class="guide-steps">
          <For each={steps()}>
            {(step, index) => (
              <section class="guide-step">
                <span class="guide-index">{String(index() + 1).padStart(2, '0')}</span>
                <span class="guide-icon">
                  <Icon name={step.icon} />
                </span>
                <div class="guide-copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </section>
            )}
          </For>
        </div>
        <p class="guide-tip">{t().guideTip}</p>
      </div>
    </Modal>
  );
}
