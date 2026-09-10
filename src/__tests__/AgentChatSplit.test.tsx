import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatHeader from '../components/ui/ChatHeader';
import ChatMessageList from '../components/ui/ChatMessageList';
import ChatComposer from '../components/ui/ChatComposer';
import { ChatMessage } from '../lib/db';

// DOM contract for the AgentChat split: identical selectors, labels, testids.
// Any change here must be mirrored by updates to chat.spec.ts + headed UCV.
describe('AgentChat split — DOM contract', () => {
  it('ChatHeader renders badge, minimize and close controls', () => {
    render(
      <ChatHeader
        badge={{ icon: null, label: 'Tiny Epistemic Engine', className: 'x' }}
        executionMode="Tiny Triage Agent"
        onMinimize={() => undefined}
        onClose={() => undefined}
      />
    );
    expect(screen.getByText('EA NITI')).toBeTruthy();
    expect(screen.getByText('Tiny Epistemic Engine')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Minimize Chat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Chat' })).toBeTruthy();
  });

  it('ChatMessageList renders messages, load-earlier and CoT affordances', () => {
    const messages = [
      { id: 1, threadId: 1, role: 'user', content: 'Hello', inferenceEngine: 'pending', timestamp: new Date() },
      { id: 2, threadId: 1, role: 'assistant', content: 'Hi there', inferenceEngine: 'neuro-symbolic', timestamp: new Date() },
    ] as ChatMessage[];
    render(
      <ChatMessageList
        messages={messages}
        isTyping={false}
        isGenerating={true}
        isCoTExpanded={true}
        hasMoreBefore={true}
        isLoadingEarlier={false}
        unlocked={true}
        onLoadEarlier={() => undefined}
        onToggleCoT={() => undefined}
      />
    );
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Hi there')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load earlier chat messages' })).toBeTruthy();
    expect(screen.getByText('Thinking Process')).toBeTruthy();
  });

  it('ChatComposer renders router select, input, attach and send controls', () => {
    render(
      <ChatComposer
        input=""
        effectiveMaxLength={8000}
        executionMode="Tiny Triage Agent"
        isTyping={false}
        isGenerating={false}
        isUploading={false}
        unlocked={true}
        loadPercent={0}
        loadText=""
        onInputChange={() => undefined}
        onSend={() => undefined}
        onAttachClick={() => undefined}
        onFileChange={() => undefined}
        onModeChange={() => undefined}
      />
    );
    expect(screen.getByTestId('agentchat-execution-mode')).toBeTruthy();
    expect(screen.getByTestId('agentchat-message-input')).toBeTruthy();
    expect(screen.getByTestId('agentchat-send-button')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attach File' })).toBeTruthy();
  });
});
