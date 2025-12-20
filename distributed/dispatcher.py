
import json
import os
import subprocess
import logging
from typing import Dict, Optional

logger = logging.getLogger("DistributedDispatcher")

class ComputeNode:
    def __init__(self, name: str, config: Dict):
        self.name = name
        self.host = config['host']
        self.user = config['user']
        self.key_path = os.path.expanduser(config['key_path'])
        self.python = config.get('python_path', 'python3')
        self.capabilities = config.get('capabilities', [])

    def get_ssh_cmd(self) -> str:
        """Returns the base SSH command string."""
        return f"ssh -i {self.key_path} {self.user}@{self.host}"

    def run_command(self, cmd: str) -> str:
        """Runs a command on the remote node and returns stdout."""
        full_cmd = f"{self.get_ssh_cmd()} '{cmd}'"
        logger.info(f"🚀 Dispatching to {self.name}: {cmd}")
        
        try:
            result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                logger.error(f"❌ Remote execution failed: {result.stderr}")
                raise RuntimeError(result.stderr)
            return result.stdout.strip()
        except Exception as e:
            logger.error(f"Execution error: {e}")
            raise

    def sync_codebase(self, local_path: str, remote_path: str):
        """Rsyncs the local codebase to the remote server."""
        rsync_cmd = f"rsync -avz -e 'ssh -i {self.key_path}' --exclude '__pycache__' --exclude 'venv' {local_path}/ {self.user}@{self.host}:{remote_path}"
        logger.info(f"🔄 Syncing code to {self.name}...")
        subprocess.run(rsync_cmd, shell=True, check=True)

class TaskDispatcher:
    def __init__(self, config_path: str = "config.json"):
        self.nodes = {}
        self._load_config(config_path)

    def _load_config(self, path: str):
        if not os.path.exists(path):
            logger.warning(f"Config {path} not found.")
            return
        
        with open(path, 'r') as f:
            data = json.load(f)
            for name, cfg in data.get('nodes', {}).items():
                self.nodes[name] = ComputeNode(name, cfg)

    def get_node(self, capability: Optional[str] = None) -> Optional[ComputeNode]:
        """Finds a node with the requested capability."""
        for node in self.nodes.values():
            if not capability or capability in node.capabilities:
                return node
        return None

    def dispatch_job(self, job_script: str, capability: str = "training"):
        """Syncs code and runs a python script on a suitable remote node."""
        node = self.get_node(capability)
        if not node:
            logger.error(f"No node found with capability: {capability}")
            return

        # 1. Sync
        remote_root = f"/home/{node.user}/sharpe_optima"
        node.run_command(f"mkdir -p {remote_root}")
        node.sync_codebase(".", remote_root)

        # 2. Execute
        remote_cmd = f"cd {remote_root} && {node.python} {job_script}"
        output = node.run_command(remote_cmd)
        
        logger.info(f"✅ Job Complete. Output:\n{output}")

if __name__ == "__main__":
    # Example Usage
    logging.basicConfig(level=logging.INFO)
    dispatcher = TaskDispatcher()
    # dispatcher.dispatch_job("trading/scripts/heavy_backtest.py", "training")
