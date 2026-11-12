import { ProjectDetails, TaskDetails, UploadForm } from './Details';
import { ProjectTools } from '@/components/ProjectTools';
import { ImageCropUpload, RichText } from '@/components/Editors';

export function ProjectLiveDetails() {
  return (
    <ProjectDetails
      additional={(project, canManage) => <ProjectTools project={project} canManage={canManage} />}
    />
  );
}

export function TaskLiveDetails() {
  return (
    <TaskDetails
      description={(value) => <RichText value={value} />}
      upload={(task) => (
        <>
          <UploadForm taskId={task.id} />
          <ImageCropUpload taskId={task.id} />
        </>
      )}
    />
  );
}
