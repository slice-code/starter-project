(function (global) {
  'use strict';

  function init() {
    // Inject Custom Styles to make Drawflow look like n8n
    if (!document.getElementById('drawflow-n8n-style')) {
      const style = el('style').attr('id', 'drawflow-n8n-style').html(`
        .drawflow-container {
          position: relative;
          width: 100%;
          height: calc(100vh - 120px);
          background-color: #f8fafc;
          background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
          background-size: 20px 20px;
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .drawflow {
          width: 100%;
          height: 100%;
          background: transparent !important;
        }
        .drawflow .drawflow-node {
          background: #ffffff !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 10px !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03) !important;
          width: 220px !important;
          min-height: 70px !important;
          padding: 10px !important;
          color: #0f172a !important;
          font-family: Inter, sans-serif !important;
        }
        .drawflow .drawflow-node.selected {
          border: 2px solid #2563eb !important;
          box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.15) !important;
        }
        .drawflow .drawflow-node .inputs, .drawflow .drawflow-node .outputs {
          width: 0px !important;
        }
        .drawflow .drawflow-node .input, .drawflow .drawflow-node .output {
          width: 12px !important;
          height: 12px !important;
          border: 2px solid #ffffff !important;
          background: #cbd5e1 !important;
          border-radius: 50% !important;
          position: absolute !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          cursor: pointer !important;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .drawflow .drawflow-node .input:hover, .drawflow .drawflow-node .output:hover {
          background: #2563eb !important;
          transform: translateY(-50%) scale(1.2) !important;
        }
        .drawflow .drawflow-node .input {
          left: -6px !important;
        }
        .drawflow .drawflow-node .output {
          right: -6px !important;
        }
        .drawflow .connection .main-path {
          stroke: #94a3b8 !important;
          stroke-width: 3px !important;
        }
        .drawflow .connection .main-path:hover {
          stroke: #2563eb !important;
        }
        .drawflow-node-title {
          font-weight: 700;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }
        .drawflow-node-title i {
          color: #ff6f61; /* n8n vibrant orange accent */
        }
        .drawflow-node-desc {
          font-size: 0.72rem;
          color: #64748b;
        }
        .drawflow-toolbar {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 100;
          display: flex;
          gap: 6px;
        }
        .drawflow-btn {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #334155;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          transition: all 0.15s ease;
        }
        .drawflow-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #0f172a;
        }
        .drawflow-btn-primary {
          background: #2563eb;
          color: #ffffff;
          border: none;
        }
        .drawflow-btn-primary:hover {
          background: #1d4ed8;
          color: #ffffff;
        }
      `).get();
      document.head.appendChild(style);
    }

    // Outer Layout Frame
    const frame = el('div').css({
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '1rem'
    });

    const header = el('div').css({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    });

    header.child([
      el('div').child([
        el('h2').text('Workflow Editor (n8n Style)').css({ margin: 0, fontSize: '1.25rem', fontWeight: '700' }),
        el('p').text('Alur integrasi otomatis menggunakan Drawflow').css({ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' })
      ])
    ]);

    const container = el('div').class('drawflow-container');
    const drawflowDiv = el('div').id('drawflow-canvas').class('drawflow');
    container.child(drawflowDiv);

    // Toolbar
    const toolbar = el('div').class('drawflow-toolbar');
    const addWebhookBtn = el('button').class('drawflow-btn').html('<i class="fas fa-network-wired"></i> Add Webhook');
    const addRequestBtn = el('button').class('drawflow-btn').html('<i class="fas fa-paper-plane"></i> Add HTTP Request');
    const addDbBtn = el('button').class('drawflow-btn').html('<i class="fas fa-database"></i> Add Database');
    const clearBtn = el('button').class('drawflow-btn').html('<i class="fas fa-trash"></i> Clear');
    
    toolbar.child([addWebhookBtn, addRequestBtn, addDbBtn, clearBtn]);
    container.child(toolbar);

    frame.child([header, container]);

    // Drawflow Initialization
    // Wait until mounted to DOM to initialize Drawflow
    frame.load(() => {
      const canvasEl = document.getElementById('drawflow-canvas');
      if (!canvasEl) return;

      const editor = new Drawflow(canvasEl);
      editor.start();

      // Default Setup: Add some default nodes connected
      const node1 = editor.addNode('webhook', 0, 1, 150, 200, 'webhook', {}, 
        `<div class="drawflow-node-title"><i class="fas fa-network-wired"></i> Webhook</div><div class="drawflow-node-desc">Listen for incoming trigger</div>`
      );
      
      const node2 = editor.addNode('http', 1, 1, 450, 200, 'http', {}, 
        `<div class="drawflow-node-title" style="color: #2563eb;"><i class="fas fa-paper-plane" style="color: #2563eb;"></i> HTTP Request</div><div class="drawflow-node-desc">Send GET/POST request</div>`
      );

      editor.addConnection(node1, node2, 'output_1', 'input_1');

      // Add node buttons logic
      addWebhookBtn.click(() => {
        editor.addNode('webhook', 0, 1, 100 + Math.random() * 100, 150 + Math.random() * 100, 'webhook', {}, 
          `<div class="drawflow-node-title"><i class="fas fa-network-wired"></i> Webhook</div><div class="drawflow-node-desc">Listen for incoming trigger</div>`
        );
      });

      addRequestBtn.click(() => {
        editor.addNode('http', 1, 1, 100 + Math.random() * 100, 150 + Math.random() * 100, 'http', {}, 
          `<div class="drawflow-node-title" style="color: #2563eb;"><i class="fas fa-paper-plane" style="color: #2563eb;"></i> HTTP Request</div><div class="drawflow-node-desc">Send GET/POST request</div>`
        );
      });

      addDbBtn.click(() => {
        editor.addNode('db', 1, 0, 100 + Math.random() * 100, 150 + Math.random() * 100, 'db', {}, 
          `<div class="drawflow-node-title" style="color: #16a34a;"><i class="fas fa-database" style="color: #16a34a;"></i> Database</div><div class="drawflow-node-desc">Save payload details</div>`
        );
      });

      clearBtn.click(() => {
        editor.clearModuleSelected();
        editor.clear();
      });
    });

    return frame.get();
  }

  global.WorkflowPage = { init };
})(typeof window !== 'undefined' ? window : global);
