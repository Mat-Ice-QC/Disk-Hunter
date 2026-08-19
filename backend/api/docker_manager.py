import subprocess
import asyncio
import re

def get_running_containers(filter_name: str) -> list[str]:
    """Returns a list of running container names matching the filter."""
    try:
        cmd = ["docker", "ps", "--format", "{{.Names}}", "--filter", f"name={filter_name}"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return [c for c in result.stdout.strip().split('\n') if c]
    except Exception:
        return []

def get_container_logs(container_name: str, tail: int = None) -> str:
    """Gets logs for a specific container."""
    try:
        cmd = ["docker", "logs"]
        if tail:
            cmd.extend(["--tail", str(tail)])
        cmd.append(container_name)
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.stdout.strip() or result.stderr.strip()
    except Exception:
        return ""

def save_container_logs(container_name: str, log_file_path: str):
    """Saves container logs to a file."""
    try:
        with open(log_file_path, "w") as f:
            subprocess.run(["docker", "logs", container_name], stdout=f, stderr=subprocess.STDOUT)
    except Exception as e:
        print(f"Failed to save logs to {log_file_path}: {e}")

def stop_and_remove_container(container_name: str):
    """Stops and forcefully removes a container."""
    try:
        subprocess.run(["docker", "stop", container_name], capture_output=True, check=False)
        subprocess.run(["docker", "rm", "-f", container_name], capture_output=True, check=False)
    except Exception:
        pass

async def wait_for_container(container_name: str) -> str:
    """Waits for a container to exit and returns the exit code."""
    proc = await asyncio.create_subprocess_exec("docker", "wait", container_name, stdout=asyncio.subprocess.PIPE)
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()

def run_container(name: str, image: str, args: list[str], privileged: bool = False, devices: list[str] = None, detach: bool = True, tty: bool = False, env: dict = None, debug_list: list = None) -> bool:
    """Runs a docker container and returns True if successful. Optional debug_list collects docker commands and outputs."""
    rm_cmd = ["docker", "rm", "-f", name]
    if debug_list is not None:
        debug_list.append(f"Cleanup command: {' '.join(rm_cmd)}")
    subprocess.run(rm_cmd, capture_output=True, check=False)
    
    cmd = ["docker", "run"]
    if detach:
        cmd.append("-d")
    if tty:
        cmd.append("-t")
    
    if env:
        for k, v in env.items():
            cmd.extend(["-e", f"{k}={v}"])
            
    cmd.extend(["--name", name])
    
    if privileged:
        cmd.append("--privileged")
        
    if devices:
        for d in devices:
            cmd.extend(["--device", d])
            
    cmd.append(image)
    cmd.extend(args)
    
    if debug_list is not None:
        debug_list.append(f"Run command: {' '.join(cmd)}")
        
    res = subprocess.run(cmd, capture_output=True, text=True)
    
    if debug_list is not None:
        debug_list.append(f"Command exit code: {res.returncode}")
        if res.stdout.strip():
            debug_list.append(f"Command stdout: {res.stdout.strip()}")
        if res.stderr.strip():
            debug_list.append(f"Command stderr: {res.stderr.strip()}")
            
    return res.returncode == 0
