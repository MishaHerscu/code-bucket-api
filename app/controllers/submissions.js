'use strict';

const controller = require('lib/wiring/controller');
const multer = require('app/middleware').multer;

const models = require('app/models');
const Submission = models.submission;
const Challenge = models.challenge;

const uploader = require('lib/aws-s3-upload');

const authenticate = require('./concerns/authenticate');

const index = (req, res, next) => {
  Submission.find()
    .then(submissions => res.json({ submissions }))
    .catch(err => next(err));
};

const show = (req, res, next) => {
  Submission.findById(req.params.id)
    .then(submission => submission ? res.json({ submission }) : next())
    .catch(err => next(err));
};

const create = (req, res, next) => {
  uploader.awsUpload(req.file.buffer)
  .then((response) => {
    console.log(req.body.upload);
    return {
      location: response.Location,
      _challenge: req.body.upload.challenge_id,
      challengeName: req.body.upload.challengeName,
      _challengeOwner: req.body.upload.challengeOwner,
      _owner: req.currentUser._id,
      ownerName: req.currentUser.givenName + ' ' + req.currentUser.surname,
    };
  })

  // this is the auto-grading
  .then((upload) => {
    let submissionString = req.file.buffer.toString('utf8');
    upload.evalAnswer = eval(submissionString).toString();
    let challengeSearch = { _id: req.body.upload.challenge_id };
    Challenge.find(challengeSearch)
    .then((challenge)  => {
      if(upload.evalAnswer === challenge[0].answer){
        upload.autoPass = true;
      } else {
        upload.autoPass = false;
      }
      upload.autoGraded = true;
      return upload;
    })
    .then((upload) => {
      return Submission.create(upload);
    })
    .then(submission => res.json({ submission }))
    .catch(err => next(err));
  });
};

const gradeSubmission = (req, res, next) => {
  let search = { _id: req.params.id, _challengeOwner: req.currentUser._id };
  Submission.findOne(search)
    .then(submission => {
      if (!submission) {
        return next();
      }

      delete req.body._owner;  // disallow owner reassignment.
      return submission.update(req.body.submission)
        .then(submission => res.json({ submission }));
    })
    .catch(err => next(err));
};

const update = (req, res, next) => {
  let search = { _id: req.params.id, _owner: req.currentUser._id };
  Submission.findOne(search)
    .then(submission => {
      if (!submission) {
        return next();
      }

      // disallow owner reassignment
      delete req.body._owner;

      // upload file to S3
      uploader.awsUpload(req.file.buffer)

      .then((response) => {
        return {
          location: response.Location,
        };
      })
      .then((updateObject) => {
        return submission.update(updateObject);
      })
      .then((updateObject) => {
        res.json({ updateObject });
      })
      .catch(err => next(err));
    });
  };

const destroy = (req, res, next) => {
  let search = { _id: req.params.id, _owner: req.currentUser._id };
  Submission.findOne(search)
    .then(submission => {
      if (!submission) {
        return next();
      }

      let responseSubmission = submission;
      return submission.remove()
        .then(() => res.json({ responseSubmission }));
    })
    .catch(err => next(err));
};

const getUserSubmissions = (req, res, next) => {
  Submission.find({ _owner: req.currentUser._id })
    .then(submissions => res.json({ submissions }))
    .catch(err => next(err));
};

module.exports = controller({
  index,
  show,
  create,
  update,
  destroy,
  getUserSubmissions,
  gradeSubmission,
}, { before: [
  { method: authenticate, except: ['index', 'show'] },
  { method: multer.single('upload[file]'), only: ['create', 'update'] },
], });
