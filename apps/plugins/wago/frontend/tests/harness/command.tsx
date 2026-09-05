import { useState } from 'react';
import { Button } from '@heroui/react';
import { ReactFlow, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NodeEditor } from '../../../../../frontend/src/app/resources/details/flows/node/editor';
import { CommandContext } from './command-context';

const schema = {
  type: 'plugin.wago.command',
  label: 'WAGO command',
  description: 'Fixture-only command authoring; nothing is dispatched.',
  configSchema: { dynamic: true, type: 'object', properties: {}, required: ['controllerId'] },
  inputs: [],
  outputs: [],
};
const translate = (key: string) => ({ 'editor.buttons.save': 'Save', 'editor.buttons.cancel': 'Cancel' })[key] ?? key;

function CommandNode(_props: NodeProps) {
  return (
    <NodeEditor schema={schema} tNodeTranslations={translate} tNodeExists={() => false}>
      {(open) => <Button onPress={open}>Edit command</Button>}
    </NodeEditor>
  );
}

const nodeTypes = { command: CommandNode };

export function CommandHarness() {
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [nodes, setNodes] = useState([
    { id: 'fixture-command', type: 'command', position: { x: 20, y: 20 }, data: {} },
  ]);
  return (
    <CommandContext
      value={{
        resourceId: 91058,
        updateNodeData: (id, data) => {
          setSaved(data);
          setNodes((current) => current.map((node) => (node.id === id ? { ...node, data } : node)));
        },
      }}
    >
      <h1>Fixture-only production command form</h1>
      <output aria-label="Saved command" style={{ display: 'block', overflowWrap: 'anywhere' }}>
        {JSON.stringify(saved)}
      </output>
      <div style={{ width: '100%', height: 200 }}>
        <ReactFlow nodes={nodes} nodeTypes={nodeTypes} proOptions={{ hideAttribution: true }} />
      </div>
    </CommandContext>
  );
}
