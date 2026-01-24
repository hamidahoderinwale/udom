"""
Utility for loading uDOM snapshots from the database.

Supports multiple access methods:
1. Direct SQLite access (fastest)
2. HTTP API access (when server is running)
3. Datasette JSON API (for exploration)
"""

import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Optional, Any
import requests


class SnapshotLoader:
    """Load uDOM snapshots from various sources."""
    
    def __init__(self, db_path: Optional[str] = None, json_dir: Optional[str] = None, api_url: Optional[str] = None):
        """
        Initialize snapshot loader.
        
        Args:
            db_path: Path to snapshots.db (legacy, default: ../udom-server/snapshots.db)
            json_dir: Path to JSON snapshots directory (default: ../udom-server/snapshots)
            api_url: Base URL for HTTP API (default: http://localhost:3000)
        """
        if db_path is None:
            # Default to relative path from rl/utils/
            self.db_path = Path(__file__).parent.parent.parent / 'udom-server' / 'snapshots.db'
        else:
            self.db_path = Path(db_path)
        
        if json_dir is None:
            # Default to JSON storage directory
            # From rl/utils/loaders/ -> go up to taste/ -> then to udom-server/snapshots
            rl_dir = Path(__file__).parent.parent.parent  # rl/
            self.json_dir = rl_dir.parent / 'udom-server' / 'snapshots'  # taste/udom-server/snapshots
        else:
            self.json_dir = Path(json_dir)
        
        self.index_file = self.json_dir / '_index.json'
        self.api_url = api_url or 'http://localhost:3000'
        self.datasette_url = 'http://localhost:8000'
    
    def load_all(self, use_api: bool = False, use_json: bool = True) -> List[Dict[str, Any]]:
        """
        Load all snapshots.
        
        Args:
            use_api: If True, use HTTP API instead of direct access
            use_json: If True (and use_api=False), use JSON files instead of SQLite
        
        Returns:
            List of uDOM snapshot dictionaries
        """
        if use_api:
            return self._load_from_api()
        elif use_json and self.json_dir.exists():
            return self._load_from_json()
        else:
            return self._load_from_db()
    
    def load_by_artifact_id(self, artifact_id: str, use_api: bool = False, use_json: bool = True) -> List[Dict[str, Any]]:
        """
        Load snapshots for a specific artifact.
        
        Args:
            artifact_id: Figma artifact ID (e.g., figma://file/ABC/node/123)
            use_api: If True, use HTTP API
            use_json: If True (and use_api=False), use JSON files instead of SQLite
        
        Returns:
            List of snapshots for the artifact
        """
        if use_api:
            return self._load_from_api(filters={'artifact_id': artifact_id})
        elif use_json and self.json_dir.exists():
            return self._load_from_json(filters={'artifact_id': artifact_id})
        else:
            return self._load_from_db(filters={'artifact_id': artifact_id})
    
    def load_by_type(self, artifact_type: str, use_api: bool = False, use_json: bool = True) -> List[Dict[str, Any]]:
        """
        Load snapshots by artifact type.
        
        Args:
            artifact_type: Type (e.g., 'figma_component', 'react_component')
            use_api: If True, use HTTP API
            use_json: If True (and use_api=False), use JSON files instead of SQLite
        
        Returns:
            List of snapshots of the specified type
        """
        if use_api:
            return self._load_from_api(filters={'artifact_type': artifact_type})
        elif use_json and self.json_dir.exists():
            return self._load_from_json(filters={'artifact_type': artifact_type})
        else:
            return self._load_from_db(filters={'artifact_type': artifact_type})
    
    def load_recent(self, limit: int = 10, use_api: bool = False, use_json: bool = True) -> List[Dict[str, Any]]:
        """
        Load most recent snapshots.
        
        Args:
            limit: Maximum number of snapshots to return
            use_api: If True, use HTTP API
            use_json: If True (and use_api=False), use JSON files instead of SQLite
        
        Returns:
            List of recent snapshots
        """
        if use_api:
            snapshots = self._load_from_api()
            return sorted(snapshots, key=lambda s: s['metadata']['timestamp'], reverse=True)[:limit]
        elif use_json and self.json_dir.exists():
            return self._load_from_json(limit=limit)
        else:
            return self._load_from_db(limit=limit)
    
    def _load_from_json(self, filters: Optional[Dict[str, str]] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Load snapshots from JSON file storage."""
        import json
        
        if not self.index_file.exists():
            return []
        
        with open(self.index_file, 'r') as f:
            index = json.load(f)
        
        snapshot_ids = list(index.get('snapshots', {}).keys())
        
        # Apply filters
        if filters:
            if 'artifact_id' in filters:
                snapshot_ids = [
                    sid for sid in snapshot_ids
                    if index['snapshots'][sid].get('artifact_id') == filters['artifact_id']
                ]
            if 'artifact_type' in filters:
                snapshot_ids = [
                    sid for sid in snapshot_ids
                    if index['snapshots'][sid].get('artifact_type') == filters['artifact_type']
                ]
            if 'timestamp_from' in filters:
                snapshot_ids = [
                    sid for sid in snapshot_ids
                    if index['snapshots'][sid].get('timestamp', 0) >= filters['timestamp_from']
                ]
            if 'timestamp_to' in filters:
                snapshot_ids = [
                    sid for sid in snapshot_ids
                    if index['snapshots'][sid].get('timestamp', 0) <= filters['timestamp_to']
                ]
        
        # Load snapshots
        snapshots = []
        for sid in snapshot_ids:
            entry = index['snapshots'][sid]
            filepath = self.json_dir / entry['filepath']
            if filepath.exists():
                with open(filepath, 'r') as f:
                    snapshots.append(json.load(f))
        
        # Sort by timestamp DESC
        snapshots.sort(key=lambda s: s['metadata']['timestamp'], reverse=True)
        
        if limit:
            return snapshots[:limit]
        return snapshots
    
    def _load_from_db(self, filters: Optional[Dict[str, str]] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Load snapshots directly from SQLite database."""
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found at {self.db_path}")
        
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        query = "SELECT udom_data FROM snapshots WHERE 1=1"
        params = []
        
        if filters:
            if 'artifact_id' in filters:
                query += " AND artifact_id = ?"
                params.append(filters['artifact_id'])
            if 'artifact_type' in filters:
                query += " AND artifact_type = ?"
                params.append(filters['artifact_type'])
        
        query += " ORDER BY timestamp DESC"
        
        if limit:
            query += f" LIMIT {limit}"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        return [json.loads(row[0]) for row in rows]
    
    def _load_from_api(self, filters: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        """Load snapshots via HTTP API."""
        try:
            url = f"{self.api_url}/snapshots"
            params = filters or {}
            response = requests.get(url, params=params, timeout=5)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise ConnectionError(f"Failed to connect to API at {self.api_url}: {e}")
    
    def load_from_datasette(self, query: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Load snapshots via Datasette JSON API.
        
        Args:
            query: Optional SQL query name (from datasette-config.yaml)
        
        Returns:
            List of snapshots
        """
        try:
            if query:
                url = f"{self.datasette_url}/snapshots/{query}.json"
            else:
                url = f"{self.datasette_url}/snapshots.json"
            
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json()
            
            # Datasette returns {'rows': [...], 'columns': [...]}
            if 'rows' in data:
                # Extract udom_data from rows
                columns = data.get('columns', [])
                udom_idx = columns.index('udom_data') if 'udom_data' in columns else None
                
                if udom_idx is not None:
                    return [json.loads(row[udom_idx]) for row in data['rows']]
                else:
                    # Return raw rows if structure is different
                    return data['rows']
            else:
                return data
        except requests.exceptions.RequestException as e:
            raise ConnectionError(f"Failed to connect to Datasette at {self.datasette_url}: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics."""
        import json
        
        # Try JSON storage first
        if self.index_file.exists():
            with open(self.index_file, 'r') as f:
                index = json.load(f)
            
            by_type = {}
            for sid, entry in index.get('snapshots', {}).items():
                atype = entry.get('artifact_type', 'unknown')
                by_type[atype] = by_type.get(atype, 0) + 1
            
            timestamps = [e.get('timestamp', 0) for e in index.get('snapshots', {}).values()]
            latest = max(timestamps) if timestamps else None
            
            return {
                'storage': 'json_files',
                'total_snapshots': len(index.get('snapshots', {})),
                'by_type': by_type,
                'latest_timestamp': latest,
                'storage_dir': str(self.json_dir)
            }
        
        # Fallback to database
        if not self.db_path.exists():
            return {'error': 'No storage found'}
        
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        # Total snapshots
        cursor.execute("SELECT COUNT(*) FROM snapshots")
        total = cursor.fetchone()[0]
        
        # By type
        cursor.execute("""
            SELECT artifact_type, COUNT(*) 
            FROM snapshots 
            GROUP BY artifact_type
        """)
        by_type = dict(cursor.fetchall())
        
        # Recent timestamp
        cursor.execute("SELECT MAX(timestamp) FROM snapshots")
        latest = cursor.fetchone()[0]
        
        conn.close()
        
        return {
            'storage': 'sqlite',
            'total_snapshots': total,
            'by_type': by_type,
            'latest_timestamp': latest
        }


# Convenience functions
def load_snapshots(db_path: Optional[str] = None, use_api: bool = False) -> List[Dict[str, Any]]:
    """Quick function to load all snapshots."""
    loader = SnapshotLoader(db_path=db_path)
    return loader.load_all(use_api=use_api)


def load_figma_snapshots(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Quick function to load Figma snapshots."""
    loader = SnapshotLoader(db_path=db_path)
    return loader.load_by_type('figma_component')



