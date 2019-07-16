FROM python:3.7.3

LABEL maintainer="Peter Evans <mail@peterevans.dev>"
LABEL repository="https://github.com/peter-evans/create-pull-request"
LABEL homepage="https://github.com/peter-evans/create-pull-request"

LABEL com.github.actions.name="Create Pull Request"
LABEL com.github.actions.description="Creates a pull request for changes to your repository in the actions workspace"
LABEL com.github.actions.icon="git-pull-request"
LABEL com.github.actions.color="gray-dark"

COPY LICENSE README.md /

COPY requirements.txt /tmp/
RUN pip install --requirement /tmp/requirements.txt

COPY create-pull-request.py /create-pull-request.py
ENTRYPOINT [ "python", "/create-pull-request.py" ]